import { Storage } from '../shared/storage';
import { PublicProxyCheckConfig, PublicPoolCheckConfig } from '../shared/constants';
import { PublicProxyCatalog } from '../shared/public-proxy-catalog';
import { interleaveBySubnet } from '../shared/public-proxy-queue';
import { poolSignature, resolvePoolMembers } from '../shared/public-pool';
import {
    CheckProxyBatchResponse,
    NormalizedPublicProxy,
    Preset,
    ProxyType,
    PublicProxyCheckResults,
} from '../types';

export interface PublicPoolSchedulerDeps {
    runBatch: (proxies: Array<{ type: ProxyType; host: string; port: number }>) => Promise<CheckProxyBatchResponse>;
    refreshProxy: () => Promise<void>;
}

type PoolPreset = Preset & { publicPool: NonNullable<Preset['publicPool']> };

function hasPublicPool(presets: Preset[]): boolean {
    return presets.some(preset => preset.publicPool !== null && preset.publicPool !== undefined);
}

function isPoolPreset(preset: Preset): preset is PoolPreset {
    return preset.publicPool !== null && preset.publicPool !== undefined;
}

function toBatchProxy(proxy: NormalizedPublicProxy): { type: ProxyType; host: string; port: number } {
    return { type: proxy.protocol, host: proxy.ip, port: proxy.port };
}

function wait(delayMs: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

/**
 * Manages the public proxy pool lifecycle in the background:
 * - Fetches and caches the public proxy catalog (TTL: CATALOG_TTL_MS)
 * - Checks liveness of pool members (via runBatch)
 * - Triggers PAC refresh when pool composition changes (poolSignature)
 * - Responds to proxy errors via requestRecheck() with debounce
 *
 * Runs on chrome.alarms every CHECK_INTERVAL_MIN minutes.
 * Single-concurrent: concurrent runCycle() calls return the current cycle promise.
 *
 * DI dependencies injected via constructor:
 *   runBatch — batch liveness checker
 *   refreshProxy — ProxyManager.refreshIfConnected()
 */
export class PublicPoolScheduler {
    #cyclePromise: Promise<void> | null = null;
    #lastPoolSignature: string | null = null;
    #lastCycleStartedAt: number | null = null;

    constructor(private readonly deps: PublicPoolSchedulerDeps) {}

    async sync(): Promise<void> {
        const targetState = await Storage.getTargetState();
        const presets = await Storage.getActivePresets();

        if (targetState !== 'connected' || !hasPublicPool(presets)) {
            await chrome.alarms.clear(PublicPoolCheckConfig.ALARM_NAME);
            return;
        }

        const alarm = await chrome.alarms.get(PublicPoolCheckConfig.ALARM_NAME);
        if (!alarm) {
            await chrome.alarms.create(PublicPoolCheckConfig.ALARM_NAME, {
                periodInMinutes: PublicPoolCheckConfig.CHECK_INTERVAL_MIN,
            });
        }

        await this.runCycle();
    }

    runCycle(): Promise<void> {
        if (this.#cyclePromise) {
            return this.#cyclePromise;
        }

        const cycle = this.runCycleInternal();
        this.#cyclePromise = cycle;
        cycle.then(
            () => this.clearCycle(cycle),
            () => this.clearCycle(cycle),
        );
        return cycle;
    }

    requestRecheck(): void {
        const now = Date.now();
        if (
            this.#lastCycleStartedAt !== null
            && now - this.#lastCycleStartedAt < PublicPoolCheckConfig.ERROR_RECHECK_DEBOUNCE_MS
        ) {
            return;
        }

        try {
            Promise.resolve(this.runCycle()).catch(() => undefined);
        } catch {
            return;
        }
    }

    private clearCycle(cycle: Promise<void>): void {
        if (this.#cyclePromise === cycle) {
            this.#cyclePromise = null;
        }
    }

    private async runCycleInternal(): Promise<void> {
        const [targetState, presets] = await Promise.all([
            Storage.getTargetState(),
            Storage.getActivePresets(),
        ]);
        if (targetState !== 'connected' || !hasPublicPool(presets)) {
            return;
        }

        this.#lastCycleStartedAt = Date.now();
        const poolPresets = presets.filter(isPoolPreset);
        let catalog: NormalizedPublicProxy[];
        try {
            catalog = await PublicProxyCatalog.get();
        } catch {
            return;
        }

        const results = await Storage.getPublicProxyCheckResults();
        const needsCheck = new Map<string, NormalizedPublicProxy>();
        for (const preset of poolPresets) {
            const resolution = resolvePoolMembers(preset.publicPool, catalog, results, Date.now());
            for (const proxy of resolution.needsCheck) {
                needsCheck.set(`${proxy.protocol}://${proxy.ip}:${proxy.port}`, proxy);
            }
        }

        const queue = interleaveBySubnet([...needsCheck.values()]).slice(0, PublicPoolCheckConfig.MAX_PER_CYCLE);
        for (let offset = 0; offset < queue.length; offset += PublicProxyCheckConfig.BATCH_SIZE) {
            const batch = queue.slice(offset, offset + PublicProxyCheckConfig.BATCH_SIZE);
            const updates: PublicProxyCheckResults = {};
            let response: CheckProxyBatchResponse | undefined;

            for (let attempt = 0; attempt < PublicPoolCheckConfig.BUSY_RETRIES; attempt += 1) {
                response = await this.deps.runBatch(batch.map(toBatchProxy));
                if (!response.busy) {
                    break;
                }
                if (attempt < PublicPoolCheckConfig.BUSY_RETRIES - 1) {
                    await wait(PublicProxyCheckConfig.BUSY_RETRY_DELAY_MS);
                }
            }

            if (!response || response.busy) {
                return;
            }

            const checkedAt = Date.now();
            batch.forEach((proxy, index) => {
                const result = response.results?.[index];
                if (result === 'ok') {
                    updates[`${proxy.protocol}://${proxy.ip}:${proxy.port}`] = { status: 'alive', checkedAt };
                } else if (result === 'error' || result === 'timeout') {
                    updates[`${proxy.protocol}://${proxy.ip}:${proxy.port}`] = { status: 'dead', checkedAt };
                }
            });
            if (Object.keys(updates).length > 0) {
                await Storage.mergePublicProxyCheckResults(updates);
            }
        }

        const latestResults = await Storage.getPublicProxyCheckResults();
        const currentSignature = poolPresets
            .map(preset => {
                const resolution = resolvePoolMembers(preset.publicPool, catalog, latestResults, Date.now());
                return poolSignature(resolution.members);
            })
            .join(';');

        if (currentSignature !== this.#lastPoolSignature) {
            await this.deps.refreshProxy();
            this.#lastPoolSignature = currentSignature;
        }
    }
}

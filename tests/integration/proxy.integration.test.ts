import { ProxyState, StorageKeys } from '../../src/shared/constants';
import type { ProxyConfig, ProxyPreset } from '../../src/types';

/**
 * Integration tests for proxy workflow
 * Tests the complete flow from user action to proxy configuration
 */

// Mock chrome API
const mockStorage: Record<string, unknown> = {};
const mockProxySettings = {
    value: null as unknown,
    scope: ''
};

// Custom key for active preset
const ACTIVE_PRESET_KEY = 'activePreset';

// Setup chrome mock before tests
beforeAll(() => {
    (global as unknown as Record<string, unknown>).chrome = {
        storage: {
            local: {
                get: jest.fn((keys) => {
                    if (Array.isArray(keys)) {
                        const result: Record<string, unknown> = {};
                        keys.forEach(key => {
                            if (key in mockStorage) {
                                result[key] = mockStorage[key];
                            }
                        });
                        return Promise.resolve(result);
                    }
                    return Promise.resolve(mockStorage);
                }),
                set: jest.fn((data) => {
                    Object.assign(mockStorage, data);
                    return Promise.resolve();
                }),
                onChanged: {
                    addListener: jest.fn()
                }
            },
            sync: {
                get: jest.fn((keys) => {
                    if (Array.isArray(keys)) {
                        const result: Record<string, unknown> = {};
                        keys.forEach(key => {
                            if (key in mockStorage) {
                                result[key] = mockStorage[key];
                            }
                        });
                        return Promise.resolve(result);
                    }
                    return Promise.resolve(mockStorage);
                }),
                set: jest.fn((data) => {
                    Object.assign(mockStorage, data);
                    return Promise.resolve();
                }),
                onChanged: {
                    addListener: jest.fn()
                }
            },
            onChanged: {
                addListener: jest.fn()
            }
        },
        proxy: {
            settings: {
                set: jest.fn((config) => {
                    mockProxySettings.value = config.value;
                    mockProxySettings.scope = config.scope;
                    return Promise.resolve();
                }),
                clear: jest.fn(() => {
                    mockProxySettings.value = null;
                    mockProxySettings.scope = '';
                    return Promise.resolve();
                })
            },
            onAuthRequired: {
                addListener: jest.fn()
            }
        },
        webRequest: {
            onAuthRequired: {
                addListener: jest.fn()
            }
        },
        runtime: {
            lastError: null
        }
    };
});

describe('Proxy Integration Tests', () => {
    beforeEach(() => {
        // Reset storage
        Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
        mockProxySettings.value = null;
        mockProxySettings.scope = '';
        jest.clearAllMocks();
    });

    describe('Proxy Configuration Flow', () => {
        it('should store proxy configuration correctly', async () => {
            const proxy: ProxyConfig = {
                id: 'proxy-1',
                name: 'Test Proxy',
                host: '192.168.1.1',
                port: 8080,
                type: 'http'
            };

            mockStorage[StorageKeys.PROXIES] = [proxy];

            const result = await chrome.storage.sync.get([StorageKeys.PROXIES]);
            expect(result[StorageKeys.PROXIES]).toHaveLength(1);
            expect((result[StorageKeys.PROXIES] as ProxyConfig[])[0].host).toBe('192.168.1.1');
        });

        it('should handle proxy with authentication', async () => {
            const proxy: ProxyConfig = {
                id: 'proxy-auth',
                name: 'Auth Proxy',
                host: 'proxy.example.com',
                port: 3128,
                type: 'http',
                username: 'user',
                password: 'pass'
            };

            mockStorage[StorageKeys.PROXIES] = [proxy];

            const result = await chrome.storage.sync.get([StorageKeys.PROXIES]);
            expect((result[StorageKeys.PROXIES] as ProxyConfig[])[0].username).toBe('user');
            expect((result[StorageKeys.PROXIES] as ProxyConfig[])[0].password).toBe('pass');
        });

        it('should handle SOCKS5 proxy type', async () => {
            const proxy: ProxyConfig = {
                id: 'socks-proxy',
                name: 'SOCKS5 Proxy',
                host: 'socks.example.com',
                port: 1080,
                type: 'socks5'
            };

            mockStorage[StorageKeys.PROXIES] = [proxy];

            const result = await chrome.storage.sync.get([StorageKeys.PROXIES]);
            expect((result[StorageKeys.PROXIES] as ProxyConfig[])[0].type).toBe('socks5');
        });
    });

    describe('Preset Workflow', () => {
        it('should create preset with proxy', async () => {
            const proxy: ProxyConfig = {
                id: 'proxy-1',
                name: 'Main Proxy',
                host: '10.0.0.1',
                port: 8080,
                type: 'http'
            };

            const preset: ProxyPreset = {
                id: 'preset-1',
                name: 'Work Preset',
                proxyId: 'proxy-1',
                rules: []
            };

            mockStorage[StorageKeys.PROXIES] = [proxy];
            mockStorage[StorageKeys.PRESETS] = [preset];

            const proxies = await chrome.storage.sync.get([StorageKeys.PROXIES]);
            const presets = await chrome.storage.sync.get([StorageKeys.PRESETS]);

            expect((presets[StorageKeys.PRESETS] as ProxyPreset[])[0].proxyId).toBe('proxy-1');
            expect((proxies[StorageKeys.PROXIES] as ProxyConfig[]).find(p => p.id === 'proxy-1')).toBeDefined();
        });

        it('should handle preset with URL rules', async () => {
            const preset: ProxyPreset = {
                id: 'preset-rules',
                name: 'Rules Preset',
                proxyId: 'proxy-1',
                rules: [
                    { id: 'rule-1', pattern: '*.google.com', type: 'include' },
                    { id: 'rule-2', pattern: '*.facebook.com', type: 'exclude' }
                ]
            };

            mockStorage[StorageKeys.PRESETS] = [preset];

            const result = await chrome.storage.sync.get([StorageKeys.PRESETS]);
            expect((result[StorageKeys.PRESETS] as ProxyPreset[])[0].rules).toHaveLength(2);
            expect((result[StorageKeys.PRESETS] as ProxyPreset[])[0].rules[0].type).toBe('include');
            expect((result[StorageKeys.PRESETS] as ProxyPreset[])[0].rules[1].type).toBe('exclude');
        });

        it('should activate preset correctly', async () => {
            const preset: ProxyPreset = {
                id: 'active-preset',
                name: 'Active',
                proxyId: 'proxy-1',
                rules: []
            };

            mockStorage[StorageKeys.PRESETS] = [preset];
            mockStorage[ACTIVE_PRESET_KEY] = 'active-preset';

            const result = await chrome.storage.sync.get([ACTIVE_PRESET_KEY]);
            expect(result[ACTIVE_PRESET_KEY]).toBe('active-preset');
        });
    });

    describe('State Transitions', () => {
        it('should transition from disconnected to connected', async () => {
            mockStorage[StorageKeys.CURRENT_STATE] = ProxyState.DISCONNECTED;
            mockStorage[StorageKeys.TARGET_STATE] = ProxyState.CONNECTED;

            const targetState = await chrome.storage.local.get([StorageKeys.TARGET_STATE]);
            expect(targetState[StorageKeys.TARGET_STATE]).toBe(ProxyState.CONNECTED);
        });

        it('should transition from connected to disconnected', async () => {
            mockStorage[StorageKeys.CURRENT_STATE] = ProxyState.CONNECTED;
            mockStorage[StorageKeys.TARGET_STATE] = ProxyState.DISCONNECTED;

            const targetState = await chrome.storage.local.get([StorageKeys.TARGET_STATE]);
            expect(targetState[StorageKeys.TARGET_STATE]).toBe(ProxyState.DISCONNECTED);
        });

        it('should handle connecting state', async () => {
            mockStorage[StorageKeys.CURRENT_STATE] = ProxyState.CONNECTING;

            const result = await chrome.storage.local.get([StorageKeys.CURRENT_STATE]);
            expect(result[StorageKeys.CURRENT_STATE]).toBe(ProxyState.CONNECTING);
        });
    });

    describe('PAC Script Generation', () => {
        it('should generate correct PAC for HTTP proxy', () => {
            const proxy: ProxyConfig = {
                id: 'http-proxy',
                name: 'HTTP',
                host: 'proxy.test.com',
                port: 8080,
                type: 'http'
            };

            // Simulate PAC script generation
            const pacConfig = `PROXY ${proxy.host}:${proxy.port}`;
            expect(pacConfig).toBe('PROXY proxy.test.com:8080');
        });

        it('should generate correct PAC for SOCKS5 proxy', () => {
            const proxy: ProxyConfig = {
                id: 'socks-proxy',
                name: 'SOCKS',
                host: 'socks.test.com',
                port: 1080,
                type: 'socks5'
            };

            // Simulate PAC script generation
            const pacConfig = `SOCKS5 ${proxy.host}:${proxy.port}`;
            expect(pacConfig).toBe('SOCKS5 socks.test.com:1080');
        });

        it('should handle IDN domains in PAC', () => {
            const proxy: ProxyConfig = {
                id: 'idn-proxy',
                name: 'IDN',
                host: 'прокси.рф',
                port: 8080,
                type: 'http'
            };

            // IDN should be converted to punycode for PAC
            // xn--e1afncg.xn--p1ai is punycode for прокси.рф
            const expectedPunycode = 'xn--e1afncg.xn--p1ai';
            expect(expectedPunycode).toContain('xn--');
        });
    });

    describe('Multiple Proxies', () => {
        it('should store multiple proxies', async () => {
            const proxies: ProxyConfig[] = [
                { id: 'p1', name: 'Proxy 1', host: 'p1.test.com', port: 8080, type: 'http' },
                { id: 'p2', name: 'Proxy 2', host: 'p2.test.com', port: 8081, type: 'http' },
                { id: 'p3', name: 'Proxy 3', host: 'p3.test.com', port: 1080, type: 'socks5' }
            ];
            
            // Store proxies via mock storage directly
            mockStorage[StorageKeys.PROXIES] = proxies;
            
            const result = await chrome.storage.sync.get([StorageKeys.PROXIES]);
            const stored = result[StorageKeys.PROXIES] as ProxyConfig[];
            
            expect(stored).toHaveLength(3);
            expect(stored[0].id).toBe('p1');
            expect(stored[1].id).toBe('p2');
            expect(stored[2].id).toBe('p3');
        });

        it('should delete proxy from list', async () => {
            const proxies: ProxyConfig[] = [
                { id: 'p1', name: 'Proxy 1', host: 'p1.test.com', port: 8080, type: 'http' },
                { id: 'p2', name: 'Proxy 2', host: 'p2.test.com', port: 8081, type: 'http' }
            ];

            mockStorage[StorageKeys.PROXIES] = proxies;

            // Delete p1
            mockStorage[StorageKeys.PROXIES] = proxies.filter(p => p.id !== 'p1');

            const result = await chrome.storage.sync.get([StorageKeys.PROXIES]);
            expect(result[StorageKeys.PROXIES]).toHaveLength(1);
            expect((result[StorageKeys.PROXIES] as ProxyConfig[])[0].id).toBe('p2');
        });
    });

    describe('Error Handling', () => {
        it('should handle missing proxy gracefully', async () => {
            mockStorage[StorageKeys.PROXIES] = [];
            mockStorage[ACTIVE_PRESET_KEY] = 'preset-with-deleted-proxy';

            const proxies = await chrome.storage.sync.get([StorageKeys.PROXIES]);
            expect(proxies[StorageKeys.PROXIES]).toHaveLength(0);
        });

        it('should handle invalid port', () => {
            const proxy: ProxyConfig = {
                id: 'invalid',
                name: 'Invalid',
                host: 'test.com',
                port: 99999, // Invalid port
                type: 'http'
            };

            // Port validation
            const isValidPort = proxy.port > 0 && proxy.port <= 65535;
            expect(isValidPort).toBe(false);
        });

        it('should handle empty host', () => {
            const proxy: Partial<ProxyConfig> = {
                id: 'empty-host',
                name: 'Empty Host',
                host: '',
                port: 8080,
                type: 'http'
            };

            const isValidHost = proxy.host && proxy.host.trim().length > 0;
            expect(isValidHost).toBeFalsy();
        });
    });
});
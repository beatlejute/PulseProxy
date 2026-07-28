import { I18n } from '../shared/i18n';
import { RemoteConfig } from '../shared/remote-config';
import { Storage } from '../shared/storage';
import { PROXY_COLORS } from '../shared/constants';
import { ProxyServer, ProxyType } from '../types';
import { createElementFromTemplate, setAttr } from './safe-dom';
import { ModalHelper } from './modal-helper';
import { showAlert, showConfirm } from './dialog';
import { trackEvent, buildAffiliateUrl } from '../shared/analytics';
import { parseProxyString } from '../shared/proxy-parser';

export async function checkProxyBeforeAdd(
    type: ProxyType,
    host: string,
    port: number,
    username?: string,
    password?: string
): Promise<boolean> {
    const result: string = await chrome.runtime.sendMessage({
        action: 'checkProxy',
        proxy: { type, host, port, username, password },
    });

    if (result === 'ok') {
        await trackEvent('proxy_test_success', {
            proxy_type: type,
            latency_ms: 0,
            test_url: `${type}://${host}:${port}`
        });
        return true;
    }

    await trackEvent('proxy_test_failure', {
        proxy_type: type,
        test_url: `${type}://${host}:${port}`,
        error: result
    });

    const affiliateUrl = buildAffiliateUrl(RemoteConfig.referralLink, 'proxy_check_warning');
    const htmlMessage = `<div class="public-proxies-warning" style="margin:0"><span class="warning-icon">⚠️</span><div class="warning-content"><span class="warning-title">${I18n.getMessage('proxyCheckFailedTitle')}</span><span>${I18n.getMessage('publicProxiesWarning')}</span><span class="warning-recommendation"><a href="${affiliateUrl}" target="_blank" class="referral-link-tracked">${I18n.getMessage('publicProxiesRecommendation')}</a></span></div></div>`;
    const confirmed = showConfirm('', {
        okText: I18n.getMessage('saveAnyway') || 'Save anyway',
        cancelText: I18n.getMessage('cancel') || 'Cancel',
        htmlMessage,
        column: 'proxy',
    });

    // Track affiliate clicks in the confirm dialog
    setTimeout(() => {
        document.querySelectorAll<HTMLAnchorElement>('.referral-link-tracked').forEach(link => {
            link.addEventListener('click', () => {
                trackEvent('affiliate_link_clicked', {
                    provider: new URL(RemoteConfig.referralLink).hostname.replace('www.', '').split('.')[0],
                    placement: 'proxy_check_warning',
                    link_url: affiliateUrl
                });
            });
        });
    }, 0);

    return confirmed;
}

export function showProxyForm(proxy: ProxyServer | null, onSaved: () => Promise<void>): void {
    const isEdit = proxy !== null;
    const title = isEdit ? I18n.getMessage('editProxy') : I18n.getMessage('addProxy');

    const { body, footer, closeModal, onClose, build } = ModalHelper.create({
        title,
        modalClass: 'proxy-form-modal',
        column: 'proxy'
    });

    // Форму могли закрыть (Cancel/крестик/Escape/overlay), пока идёт асинхронная
    // проверка прокси — тогда сохранять поверх закрытой формы нельзя.
    let isClosed = false;
    onClose(() => { isClosed = true; });

    // Recommendation
    const recDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'proxy-form-recommendation' });
    const recIcon = createElementFromTemplate<HTMLSpanElement>('span', { className: 'recommendation-icon', textContent: '💡' });
    recDiv.appendChild(recIcon);

    const recSpan = createElementFromTemplate<HTMLSpanElement>('span', {});
    const referralLink = createElementFromTemplate<HTMLAnchorElement>('a', { textContent: 'Need reliable and affordable proxies?' });
    setAttr(referralLink, 'href', RemoteConfig.referralLink);
    setAttr(referralLink, 'target', '_blank');
    setAttr(referralLink, 'rel', 'noopener noreferrer');
    setAttr(referralLink, 'class', 'referral-link');
    setAttr(referralLink, 'data-i18n', 'proxyFormRecommendation');
    referralLink.addEventListener('click', (e) => {
        e.preventDefault();
        const url = RemoteConfig.referralLink;
        if (url && url !== '#') {
            const fullUrl = buildAffiliateUrl(url, 'proxy_form');
            trackEvent('affiliate_link_clicked', {
                provider: new URL(url).hostname.replace('www.', '').split('.')[0],
                placement: 'proxy_form',
                link_url: fullUrl
            });
            chrome.tabs.create({ url: fullUrl });
        }
    });
    recSpan.appendChild(referralLink);
    recDiv.appendChild(recSpan);
    body.appendChild(recDiv);

    // Form
    const form = createElementFromTemplate<HTMLFormElement>('form', { className: 'proxy-form' });

    // Name field
    const nameGroup = createElementFromTemplate<HTMLDivElement>('div', { className: 'form-group' });
    const nameLabel = createElementFromTemplate<HTMLLabelElement>('label', { textContent: 'Name (optional)' });
    setAttr(nameLabel, 'data-i18n', 'proxyName');
    nameGroup.appendChild(nameLabel);
    const nameInput = createElementFromTemplate<HTMLInputElement>('input', { type: 'text', name: 'name' });
    setAttr(nameInput, 'placeholder', 'My Proxy');
    if (proxy?.name) nameInput.value = proxy.name;
    nameGroup.appendChild(nameInput);
    form.appendChild(nameGroup);

    // Type row
    const typeRow = createElementFromTemplate<HTMLDivElement>('div', { className: 'form-row' });
    const typeGroup = createElementFromTemplate<HTMLDivElement>('div', { className: 'form-group' });
    const typeLabel = createElementFromTemplate<HTMLLabelElement>('label', { textContent: 'Type' });
    setAttr(typeLabel, 'data-i18n', 'proxyType');
    typeGroup.appendChild(typeLabel);

    const typeSelect = createElementFromTemplate<HTMLSelectElement>('select', { name: 'type' });
    const httpOpt = createElementFromTemplate<HTMLOptionElement>('option', { value: 'http', textContent: 'HTTP' });
    if (proxy?.type === 'http') setAttr(httpOpt, 'selected', '');
    typeSelect.appendChild(httpOpt);
    const httpsOpt = createElementFromTemplate<HTMLOptionElement>('option', { value: 'https', textContent: 'HTTPS' });
    if (proxy?.type === 'https') setAttr(httpsOpt, 'selected', '');
    typeSelect.appendChild(httpsOpt);
    const socks4Opt = createElementFromTemplate<HTMLOptionElement>('option', { value: 'socks4', textContent: 'SOCKS4' });
    if (proxy?.type === 'socks4') setAttr(socks4Opt, 'selected', '');
    typeSelect.appendChild(socks4Opt);
    const socks5Opt = createElementFromTemplate<HTMLOptionElement>('option', { value: 'socks5', textContent: 'SOCKS5' });
    if (proxy?.type === 'socks5') setAttr(socks5Opt, 'selected', '');
    typeSelect.appendChild(socks5Opt);

    typeGroup.appendChild(typeSelect);
    typeRow.appendChild(typeGroup);
    form.appendChild(typeRow);

    // Host/Port row
    const hostRow = createElementFromTemplate<HTMLDivElement>('div', { className: 'form-row' });

    const hostGroup = createElementFromTemplate<HTMLDivElement>('div', { className: 'form-group flex-grow' });
    const hostLabel = createElementFromTemplate<HTMLLabelElement>('label', { textContent: 'Host' });
    setAttr(hostLabel, 'data-i18n', 'proxyHost');
    hostGroup.appendChild(hostLabel);
    const hostInput = createElementFromTemplate<HTMLInputElement>('input', { type: 'text', name: 'host', required: true });
    setAttr(hostInput, 'placeholder', 'proxy.example.com');
    if (proxy?.host) hostInput.value = proxy.host;
    hostGroup.appendChild(hostInput);
    hostRow.appendChild(hostGroup);

    const portGroup = createElementFromTemplate<HTMLDivElement>('div', { className: 'form-group' });
    const portLabel = createElementFromTemplate<HTMLLabelElement>('label', { textContent: 'Port' });
    setAttr(portLabel, 'data-i18n', 'proxyPort');
    portGroup.appendChild(portLabel);
    const portInput = createElementFromTemplate<HTMLInputElement>('input', { type: 'number', name: 'port', required: true, min: '1', max: '65535' });
    setAttr(portInput, 'placeholder', '8080');
    if (proxy?.port) portInput.value = String(proxy.port);
    portGroup.appendChild(portInput);
    hostRow.appendChild(portGroup);
    form.appendChild(hostRow);

    // Auth checkbox
    const authGroup = createElementFromTemplate<HTMLDivElement>('div', { className: 'form-group' });
    const authLabel = document.createElement('label');
    const authCheckbox = createElementFromTemplate<HTMLInputElement>('input', { type: 'checkbox', name: 'hasAuth' });
    if (proxy?.username) setAttr(authCheckbox, 'checked', '');
    authLabel.appendChild(authCheckbox);
    authLabel.appendChild(document.createTextNode(' '));
    const authSpan = createElementFromTemplate<HTMLSpanElement>('span', { textContent: 'Authentication' });
    setAttr(authSpan, 'data-i18n', 'proxyAuth');
    authLabel.appendChild(authSpan);
    authGroup.appendChild(authLabel);
    form.appendChild(authGroup);

    // Auth fields
    const authFields = createElementFromTemplate<HTMLDivElement>('div', { className: 'auth-fields' });
    authFields.style.display = proxy?.username ? 'block' : 'none';

    const authRow = createElementFromTemplate<HTMLDivElement>('div', { className: 'form-row' });
    const usernameGroup = createElementFromTemplate<HTMLDivElement>('div', { className: 'form-group' });
    const usernameLabel = createElementFromTemplate<HTMLLabelElement>('label', { textContent: 'Username' });
    setAttr(usernameLabel, 'data-i18n', 'proxyUsername');
    usernameGroup.appendChild(usernameLabel);
    const usernameInput = createElementFromTemplate<HTMLInputElement>('input', { type: 'text', name: 'username' });
    if (proxy?.username) usernameInput.value = proxy.username;
    usernameGroup.appendChild(usernameInput);
    authRow.appendChild(usernameGroup);

    const passwordGroup = createElementFromTemplate<HTMLDivElement>('div', { className: 'form-group' });
    const passwordLabel = createElementFromTemplate<HTMLLabelElement>('label', { textContent: 'Password' });
    setAttr(passwordLabel, 'data-i18n', 'proxyPassword');
    passwordGroup.appendChild(passwordLabel);
    const passwordInput = createElementFromTemplate<HTMLInputElement>('input', { type: 'password', name: 'password' });
    if (proxy?.password) passwordInput.value = proxy.password;
    passwordGroup.appendChild(passwordInput);
    authRow.appendChild(passwordGroup);

    authFields.appendChild(authRow);
    form.appendChild(authFields);

    // Color picker
    const colorGroup = createElementFromTemplate<HTMLDivElement>('div', { className: 'form-group' });
    const colorLabel = createElementFromTemplate<HTMLLabelElement>('label', { textContent: 'Color' });
    setAttr(colorLabel, 'data-i18n', 'proxyColor');
    colorGroup.appendChild(colorLabel);

    const colorPicker = createElementFromTemplate<HTMLDivElement>('div', { className: 'color-picker' });
    let selectedColor = proxy?.color || '';

    const noneBtn = createElementFromTemplate<HTMLButtonElement>('button', { className: `color-swatch color-swatch-none${!selectedColor ? ' selected' : ''}`, type: 'button' });
    setAttr(noneBtn, 'data-color', '');
    setAttr(noneBtn, 'title', 'None');
    colorPicker.appendChild(noneBtn);

    for (const color of PROXY_COLORS) {
        const swatch = createElementFromTemplate<HTMLButtonElement>('button', { className: `color-swatch${selectedColor === color ? ' selected' : ''}`, type: 'button' });
        swatch.style.backgroundColor = color;
        setAttr(swatch, 'data-color', color);
        colorPicker.appendChild(swatch);
    }

    colorPicker.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement).closest('.color-swatch') as HTMLElement | null;
        if (!target) return;
        selectedColor = target.dataset.color || '';
        colorPicker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        target.classList.add('selected');
    });

    colorGroup.appendChild(colorPicker);
    form.appendChild(colorGroup);

    body.appendChild(form);

    // Footer with save/cancel buttons
    const originalSaveText = I18n.getMessage('save') || 'Save';
    let saveBtn: HTMLButtonElement | null = null;

    // Защита от повторного входа: обработчик асинхронный (проверка прокси идёт
    // через sendMessage в background), а кнопка Save живёт в footer вне <form>,
    // поэтому без явного guard'а двойной клик добавлял дубликат прокси.
    let isSubmitting = false;

    const setSaveChecking = (checking: boolean): void => {
        if (!saveBtn) return;
        saveBtn.disabled = checking;
        saveBtn.classList.toggle('btn-checking', checking);
        saveBtn.textContent = checking
            ? (I18n.getMessage('checkProxyChecking') || 'Checking...')
            : originalSaveText;
    };

    const { saveBtn: sb } = ModalHelper.addStandardButtons(
        footer,
        async () => {
            if (isSubmitting) return;
            isSubmitting = true;
            // Блокируем сразу — даже когда проверка выключена, иначе два быстрых
            // клика прогоняли обработчик дважды и создавали дубликат прокси.
            if (saveBtn) saveBtn.disabled = true;

            try {
                const formData = new FormData(form);
                const hasAuthCheckboxEl = form.querySelector('input[name="hasAuth"]') as HTMLInputElement;

                const host = (formData.get('host') as string)?.trim();
                const port = parseInt(formData.get('port') as string, 10);

                if (!host || !port || port < 1 || port > 65535) {
                    await showAlert(I18n.getMessage('proxyValidationError'), 'proxy');
                    return;
                }

                const name = (formData.get('name') as string)?.trim() || undefined;
                const type = formData.get('type') as ProxyType;
                const username = hasAuthCheckboxEl.checked ? (formData.get('username') as string)?.trim() || undefined : undefined;
                const password = hasAuthCheckboxEl.checked ? (formData.get('password') as string) || undefined : undefined;

                const proxyCheckEnabled = await Storage.getProxyCheckEnabled();
                let allowed = true;

                if (proxyCheckEnabled) {
                    setSaveChecking(true);
                    try {
                        allowed = await checkProxyBeforeAdd(type, host, port, username, password);
                    } finally {
                        setSaveChecking(false);
                    }
                }

                if (!allowed) return;
                // Форму закрыли, пока шла проверка — не добавляем поверх закрытой формы
                if (isClosed) return;

                const existingProxies = await Storage.getProxies();
                const isFirst = existingProxies.length === 0;
                const color = selectedColor || undefined;

                if (isEdit && proxy) {
                    await Storage.updateProxy(proxy.id, { name, type, host, port, username, password, color });
                } else {
                    await Storage.addProxy({ name, type, host, port, username, password, color, isDefault: false });

                    await trackEvent('proxy_configured', {
                        proxy_type: type,
                        is_first_proxy: isFirst ? 'true' : 'false',
                        source: 'manual'
                    });
                }
                closeModal();
                await onSaved();
            } catch (error) {
                // Например, reject из sendMessage при выгруженном service worker —
                // раньше кнопка навсегда застревала в "Checking...".
                console.error('ProxyForm: save failed:', error);
                await showAlert(I18n.getMessage('proxyValidationError'), 'proxy');
            } finally {
                isSubmitting = false;
                if (saveBtn && !isClosed) {
                    saveBtn.disabled = false;
                    saveBtn.classList.remove('btn-checking');
                    saveBtn.textContent = originalSaveText;
                }
            }
        },
        closeModal
    );
    saveBtn = sb;

    build();

    // Auth checkbox handler
    const hasAuthCheckboxEl = body.querySelector('input[name="hasAuth"]') as HTMLInputElement;
    const authFieldsEl = body.querySelector('.auth-fields') as HTMLElement;
    hasAuthCheckboxEl?.addEventListener('change', () => {
        authFieldsEl.style.display = hasAuthCheckboxEl.checked ? 'block' : 'none';
    });

    // Вставка полной строки прокси в поле Host раскладывает компоненты по полям
    hostInput.addEventListener('paste', (e) => {
        const text = e.clipboardData?.getData('text') || '';
        const parsed = parseProxyString(text);
        if (!parsed || (!parsed.type && parsed.port === undefined && parsed.username === undefined)) return;

        e.preventDefault();
        hostInput.value = parsed.host;
        if (parsed.type) typeSelect.value = parsed.type;
        if (parsed.port !== undefined) portInput.value = String(parsed.port);
        if (parsed.username !== undefined) {
            hasAuthCheckboxEl.checked = true;
            authFieldsEl.style.display = 'block';
            usernameInput.value = parsed.username;
            passwordInput.value = parsed.password ?? '';
        }
    });

    I18n.applyTranslations();
}

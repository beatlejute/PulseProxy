/**
 * @jest-environment jsdom
 */

import { mockHelpers } from '../mocks/chrome-api';

// Mock для модулей
jest.mock('../../src/shared/storage', () => ({
    Storage: {
        getProxies: jest.fn(),
        addProxy: jest.fn(),
        updateProxy: jest.fn(),
        deleteProxy: jest.fn(),
        setDefaultProxy: jest.fn(),
    },
}));

jest.mock('../../src/shared/i18n', () => ({
    I18n: {
        getMessage: jest.fn((key: string) => key),
        applyTranslations: jest.fn(),
    },
}));

jest.mock('../../src/popup/dialog', () => ({
    showConfirm: jest.fn(() => Promise.resolve(true)),
    showAlert: jest.fn(() => Promise.resolve()),
}));

import { ProxyList } from '../../src/popup/proxy-list';
import { Storage } from '../../src/shared/storage';
import { I18n } from '../../src/shared/i18n';
import { ProxyServer } from '../../src/types';
import { showConfirm, showAlert } from '../../src/popup/dialog';

describe('proxy-list.ts - ProxyListService', () => {
    // Вспомогательная функция для создания тестового прокси
    const createProxy = (
        id: string,
        name: string,
        host: string,
        port: number,
        type: 'http' | 'https' | 'socks4' | 'socks5' = 'http',
        isDefault: boolean = false,
        username?: string,
        password?: string
    ): ProxyServer => ({
        id,
        name,
        host,
        port,
        type,
        isDefault,
        username,
        password,
    });

    beforeEach(() => {
        // Сбрасываем DOM
        document.body.innerHTML = `
            <div id="proxy-list-container"></div>
        `;

        // Сбрасываем моки
        jest.clearAllMocks();

        // Устанавливаем значения по умолчанию для моков
        (Storage.getProxies as jest.Mock).mockResolvedValue([]);
        (Storage.addProxy as jest.Mock).mockResolvedValue(undefined);
        (Storage.updateProxy as jest.Mock).mockResolvedValue(undefined);
        (Storage.deleteProxy as jest.Mock).mockResolvedValue(undefined);
        (Storage.setDefaultProxy as jest.Mock).mockResolvedValue(undefined);

        // Устанавливаем значения по умолчанию для диалогов
        (showConfirm as jest.Mock).mockResolvedValue(true);
        (showAlert as jest.Mock).mockResolvedValue();

        // Сбрасываем глобальный confirm
        window.confirm = jest.fn(() => true);
        window.alert = jest.fn();
    });

    afterEach(() => {
        // Удаляем модальные окна если остались
        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
    });

    describe('init()', () => {
        it('should find container element', async () => {
            await ProxyList.init();

            const container = document.getElementById('proxy-list-container');
            expect(container).not.toBeNull();
            expect(container?.querySelector('.proxy-list')).not.toBeNull();
        });

        it('should log error if container not found', async () => {
            document.body.innerHTML = '';
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            await ProxyList.init();

            expect(consoleSpy).toHaveBeenCalledWith('ProxyList: Container not found');
            consoleSpy.mockRestore();
        });

        it('should load proxies from storage', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Test Proxy', '127.0.0.1', 8080),
            ]);

            await ProxyList.init();

            expect(Storage.getProxies).toHaveBeenCalled();
        });

        it('should render proxies after loading', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Test Proxy', '127.0.0.1', 8080),
            ]);

            await ProxyList.init();

            const proxyItem = document.querySelector('.proxy-item');
            expect(proxyItem).not.toBeNull();
        });
    });

    describe('render()', () => {
        it('should render empty list when no proxies', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([]);

            await ProxyList.init();

            const proxyItems = document.querySelectorAll('.proxy-item');
            expect(proxyItems.length).toBe(0);
        });

        it('should render multiple proxies', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Proxy 1', '127.0.0.1', 8080),
                createProxy('proxy-2', 'Proxy 2', '127.0.0.2', 8081),
            ]);

            await ProxyList.init();

            const proxyItems = document.querySelectorAll('.proxy-item');
            expect(proxyItems.length).toBe(2);
        });

        it('should have add proxy button', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn');
            expect(addBtn).not.toBeNull();
        });

        it('should call I18n.applyTranslations', async () => {
            await ProxyList.init();

            expect(I18n.applyTranslations).toHaveBeenCalled();
        });
    });

    describe('createProxyItem()', () => {
        it('should create element with proxy data', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'My Proxy', 'proxy.example.com', 8080),
            ]);

            await ProxyList.init();

            const proxyItem = document.querySelector('.proxy-item') as HTMLElement;
            expect(proxyItem.dataset.proxyId).toBe('proxy-1');
            expect(proxyItem.querySelector('.proxy-name')?.textContent).toContain('My Proxy');
            expect(proxyItem.querySelector('.proxy-details')?.textContent).toContain('proxy.example.com:8080');
        });

        it('should show host:port if name is empty', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', '', '192.168.1.1', 3128),
            ]);

            await ProxyList.init();

            const proxyName = document.querySelector('.proxy-name');
            expect(proxyName?.textContent).toContain('192.168.1.1:3128');
        });

        it('should show auth indicator when username is set', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Auth Proxy', '127.0.0.1', 8080, 'http', false, 'user', 'pass'),
            ]);

            await ProxyList.init();

            const proxyName = document.querySelector('.proxy-name');
            expect(proxyName?.textContent).toContain('🔐');
        });

        it('should not show auth indicator when no username', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'No Auth Proxy', '127.0.0.1', 8080),
            ]);

            await ProxyList.init();

            const proxyName = document.querySelector('.proxy-name');
            expect(proxyName?.textContent).not.toContain('🔐');
        });

        it('should add default class for default proxy', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Default Proxy', '127.0.0.1', 8080, 'http', true),
            ]);

            await ProxyList.init();

            const proxyItem = document.querySelector('.proxy-item');
            expect(proxyItem?.classList.contains('default')).toBe(true);
        });

        it('should show default badge for default proxy', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Default Proxy', '127.0.0.1', 8080, 'http', true),
            ]);

            await ProxyList.init();

            const defaultBadge = document.querySelector('.default-badge');
            expect(defaultBadge).not.toBeNull();
        });

        it('should show "Set Default" button for non-default proxy', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Regular Proxy', '127.0.0.1', 8080, 'http', false),
            ]);

            await ProxyList.init();

            const setDefaultBtn = document.querySelector('.set-default-btn');
            expect(setDefaultBtn).not.toBeNull();
        });

        it('should not show delete button for default proxy', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Default Proxy', '127.0.0.1', 8080, 'http', true),
            ]);

            await ProxyList.init();

            const deleteBtn = document.querySelector('.delete-proxy-btn');
            expect(deleteBtn).toBeNull();
        });

        it('should show delete button for non-default proxy', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Regular Proxy', '127.0.0.1', 8080, 'http', false),
            ]);

            await ProxyList.init();

            const deleteBtn = document.querySelector('.delete-proxy-btn');
            expect(deleteBtn).not.toBeNull();
        });

        it('should display proxy type label', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'SOCKS5 Proxy', '127.0.0.1', 1080, 'socks5'),
            ]);

            await ProxyList.init();

            const proxyDetails = document.querySelector('.proxy-details');
            expect(proxyDetails?.textContent).toContain('SOCKS5');
        });
    });

    describe('setAsDefault()', () => {
        it('should call Storage.setDefaultProxy on button click', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Proxy 1', '127.0.0.1', 8080, 'http', false),
            ]);

            await ProxyList.init();

            const setDefaultBtn = document.querySelector('.set-default-btn') as HTMLButtonElement;
            setDefaultBtn.click();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(Storage.setDefaultProxy).toHaveBeenCalledWith('proxy-1');
        });
    });

    describe('deleteProxy()', () => {
        it('should show confirmation dialog', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Test Proxy', '127.0.0.1', 8080, 'http', false),
            ]);

            await ProxyList.init();

            const deleteBtn = document.querySelector('.delete-proxy-btn') as HTMLButtonElement;
            deleteBtn.click();

            expect(showConfirm).toHaveBeenCalled();
        });

        it('should call Storage.deleteProxy if confirmed', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Test Proxy', '127.0.0.1', 8080, 'http', false),
            ]);
            (showConfirm as jest.Mock).mockResolvedValue(true);

            await ProxyList.init();

            const deleteBtn = document.querySelector('.delete-proxy-btn') as HTMLButtonElement;
            deleteBtn.click();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(Storage.deleteProxy).toHaveBeenCalledWith('proxy-1');
        });

        it('should not call Storage.deleteProxy if cancelled', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Test Proxy', '127.0.0.1', 8080, 'http', false),
            ]);
            (showConfirm as jest.Mock).mockResolvedValue(false);

            await ProxyList.init();

            const deleteBtn = document.querySelector('.delete-proxy-btn') as HTMLButtonElement;
            deleteBtn.click();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(Storage.deleteProxy).not.toHaveBeenCalled();
        });
    });

    describe('showAddProxyForm()', () => {
        it('should open proxy type dialog on add button click', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const modal = document.querySelector('.modal-overlay');
            expect(modal).not.toBeNull();
            expect(modal?.querySelector('.proxy-type-modal')).not.toBeNull();
        });

        it('should show two options in type dialog', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const options = document.querySelectorAll('.proxy-type-option');
            expect(options.length).toBe(2);
        });

        it('should close dialog on overlay click', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const overlay = document.querySelector('.modal-overlay') as HTMLElement;
            overlay.click();

            expect(document.querySelector('.modal-overlay')).toBeNull();
        });

        it('should close dialog on close button click', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const closeBtn = document.querySelector('.modal-close') as HTMLButtonElement;
            closeBtn.click();

            expect(document.querySelector('.modal-overlay')).toBeNull();
        });

        it('should open custom proxy form on first option click', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const customOption = document.querySelector('[data-type="custom"]') as HTMLButtonElement;
            customOption.click();

            const proxyFormModal = document.querySelector('.proxy-form-modal');
            expect(proxyFormModal).not.toBeNull();
        });
    });

    describe('showProxyForm() - Add mode', () => {
        it('should have form with required fields', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const customOption = document.querySelector('[data-type="custom"]') as HTMLButtonElement;
            customOption.click();

            const form = document.querySelector('.proxy-form');
            expect(form?.querySelector('input[name="name"]')).not.toBeNull();
            expect(form?.querySelector('select[name="type"]')).not.toBeNull();
            expect(form?.querySelector('input[name="host"]')).not.toBeNull();
            expect(form?.querySelector('input[name="port"]')).not.toBeNull();
        });

        it('should have auth checkbox', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const customOption = document.querySelector('[data-type="custom"]') as HTMLButtonElement;
            customOption.click();

            const authCheckbox = document.querySelector('input[name="hasAuth"]');
            expect(authCheckbox).not.toBeNull();
        });

        it('should toggle auth fields visibility on checkbox change', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const customOption = document.querySelector('[data-type="custom"]') as HTMLButtonElement;
            customOption.click();

            const authCheckbox = document.querySelector('input[name="hasAuth"]') as HTMLInputElement;
            const authFields = document.querySelector('.auth-fields') as HTMLElement;

            expect(authFields.style.display).toBe('none');

            authCheckbox.checked = true;
            authCheckbox.dispatchEvent(new Event('change'));

            expect(authFields.style.display).toBe('block');
        });

        it('should show validation error for empty host', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const customOption = document.querySelector('[data-type="custom"]') as HTMLButtonElement;
            customOption.click();

            const portInput = document.querySelector('input[name="port"]') as HTMLInputElement;
            portInput.value = '8080';

            const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
            saveBtn.click();

            expect(showAlert).toHaveBeenCalled();
        });

        it('should show validation error for invalid port', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const customOption = document.querySelector('[data-type="custom"]') as HTMLButtonElement;
            customOption.click();

            const hostInput = document.querySelector('input[name="host"]') as HTMLInputElement;
            hostInput.value = 'proxy.example.com';

            const portInput = document.querySelector('input[name="port"]') as HTMLInputElement;
            portInput.value = '999999';

            const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
            saveBtn.click();

            expect(showAlert).toHaveBeenCalled();
        });

        it('should call Storage.addProxy on valid submit', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const customOption = document.querySelector('[data-type="custom"]') as HTMLButtonElement;
            customOption.click();

            const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement;
            nameInput.value = 'New Proxy';

            const typeSelect = document.querySelector('select[name="type"]') as HTMLSelectElement;
            typeSelect.value = 'socks5';

            const hostInput = document.querySelector('input[name="host"]') as HTMLInputElement;
            hostInput.value = 'proxy.example.com';

            const portInput = document.querySelector('input[name="port"]') as HTMLInputElement;
            portInput.value = '1080';

            const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
            saveBtn.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(Storage.addProxy).toHaveBeenCalledWith({
                name: 'New Proxy',
                type: 'socks5',
                host: 'proxy.example.com',
                port: 1080,
                username: undefined,
                password: undefined,
                isDefault: false,
            });
        });

        it('should close modal on cancel button click', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const customOption = document.querySelector('[data-type="custom"]') as HTMLButtonElement;
            customOption.click();

            const cancelBtn = document.querySelector('.modal-cancel') as HTMLButtonElement;
            cancelBtn.click();

            expect(document.querySelector('.modal-overlay')).toBeNull();
        });
    });

    describe('showProxyForm() - Edit mode', () => {
        it('should populate form with existing proxy data', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Existing Proxy', 'proxy.example.com', 8080, 'https'),
            ]);

            await ProxyList.init();

            const editBtn = document.querySelector('.edit-proxy-btn') as HTMLButtonElement;
            editBtn.click();

            const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement;
            expect(nameInput.value).toBe('Existing Proxy');

            const hostInput = document.querySelector('input[name="host"]') as HTMLInputElement;
            expect(hostInput.value).toBe('proxy.example.com');

            const portInput = document.querySelector('input[name="port"]') as HTMLInputElement;
            expect(portInput.value).toBe('8080');

            const typeSelect = document.querySelector('select[name="type"]') as HTMLSelectElement;
            expect(typeSelect.value).toBe('https');
        });

        it('should check auth checkbox if proxy has credentials', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Auth Proxy', 'proxy.example.com', 8080, 'http', false, 'user', 'pass'),
            ]);

            await ProxyList.init();

            const editBtn = document.querySelector('.edit-proxy-btn') as HTMLButtonElement;
            editBtn.click();

            const authCheckbox = document.querySelector('input[name="hasAuth"]') as HTMLInputElement;
            expect(authCheckbox.checked).toBe(true);

            const usernameInput = document.querySelector('input[name="username"]') as HTMLInputElement;
            expect(usernameInput.value).toBe('user');
        });

        it('should call Storage.updateProxy on save', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Existing Proxy', 'proxy.example.com', 8080, 'http'),
            ]);

            await ProxyList.init();

            const editBtn = document.querySelector('.edit-proxy-btn') as HTMLButtonElement;
            editBtn.click();

            const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement;
            nameInput.value = 'Updated Proxy';

            const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
            saveBtn.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(Storage.updateProxy).toHaveBeenCalledWith('proxy-1', expect.objectContaining({
                name: 'Updated Proxy',
            }));
        });

        it('should show auth fields when proxy has credentials', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Auth Proxy', 'proxy.example.com', 8080, 'http', false, 'user', 'pass'),
            ]);

            await ProxyList.init();

            const editBtn = document.querySelector('.edit-proxy-btn') as HTMLButtonElement;
            editBtn.click();

            const authFields = document.querySelector('.auth-fields') as HTMLElement;
            expect(authFields.style.display).toBe('block');

            const passwordInput = document.querySelector('input[name="password"]') as HTMLInputElement;
            expect(passwordInput.value).toBe('pass');
        });

        it('should update proxy with new credentials', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Proxy', 'proxy.example.com', 8080, 'http'),
            ]);

            await ProxyList.init();

            const editBtn = document.querySelector('.edit-proxy-btn') as HTMLButtonElement;
            editBtn.click();

            const authCheckbox = document.querySelector('input[name="hasAuth"]') as HTMLInputElement;
            authCheckbox.checked = true;
            authCheckbox.dispatchEvent(new Event('change'));

            const usernameInput = document.querySelector('input[name="username"]') as HTMLInputElement;
            usernameInput.value = 'newuser';

            const passwordInput = document.querySelector('input[name="password"]') as HTMLInputElement;
            passwordInput.value = 'newpass';

            const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
            saveBtn.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(Storage.updateProxy).toHaveBeenCalledWith('proxy-1', expect.objectContaining({
                username: 'newuser',
                password: 'newpass',
            }));
        });

        it('should clear credentials when auth checkbox unchecked', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Auth Proxy', 'proxy.example.com', 8080, 'http', false, 'user', 'pass'),
            ]);

            await ProxyList.init();

            const editBtn = document.querySelector('.edit-proxy-btn') as HTMLButtonElement;
            editBtn.click();

            const authCheckbox = document.querySelector('input[name="hasAuth"]') as HTMLInputElement;
            authCheckbox.checked = false;
            authCheckbox.dispatchEvent(new Event('change'));

            const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
            saveBtn.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(Storage.updateProxy).toHaveBeenCalledWith('proxy-1', expect.objectContaining({
                username: undefined,
                password: undefined,
            }));
        });

        it('should update proxy type', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Proxy', 'proxy.example.com', 8080, 'http'),
            ]);

            await ProxyList.init();

            const editBtn = document.querySelector('.edit-proxy-btn') as HTMLButtonElement;
            editBtn.click();

            const typeSelect = document.querySelector('select[name="type"]') as HTMLSelectElement;
            typeSelect.value = 'socks5';

            const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
            saveBtn.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(Storage.updateProxy).toHaveBeenCalledWith('proxy-1', expect.objectContaining({
                type: 'socks5',
            }));
        });

        it('should close edit form on overlay click', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Proxy', 'proxy.example.com', 8080, 'http'),
            ]);

            await ProxyList.init();

            const editBtn = document.querySelector('.edit-proxy-btn') as HTMLButtonElement;
            editBtn.click();

            const overlay = document.querySelector('.modal-overlay') as HTMLElement;
            overlay.click();

            expect(document.querySelector('.modal-overlay')).toBeNull();
        });

        it('should close edit form on close button click', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Proxy', 'proxy.example.com', 8080, 'http'),
            ]);

            await ProxyList.init();

            const editBtn = document.querySelector('.edit-proxy-btn') as HTMLButtonElement;
            editBtn.click();

            const closeBtn = document.querySelector('.modal-close') as HTMLButtonElement;
            closeBtn.click();

            expect(document.querySelector('.modal-overlay')).toBeNull();
        });

        it('should show validation error for invalid port in edit mode', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Proxy', 'proxy.example.com', 8080, 'http'),
            ]);

            await ProxyList.init();

            const editBtn = document.querySelector('.edit-proxy-btn') as HTMLButtonElement;
            editBtn.click();

            const portInput = document.querySelector('input[name="port"]') as HTMLInputElement;
            portInput.value = '0';

            const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
            saveBtn.click();

            expect(showAlert).toHaveBeenCalled();
            expect(Storage.updateProxy).not.toHaveBeenCalled();
        });

        it('should show validation error for port exceeding 65535', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Proxy', 'proxy.example.com', 8080, 'http'),
            ]);

            await ProxyList.init();

            const editBtn = document.querySelector('.edit-proxy-btn') as HTMLButtonElement;
            editBtn.click();

            const portInput = document.querySelector('input[name="port"]') as HTMLInputElement;
            portInput.value = '65536';

            const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
            saveBtn.click();

            expect(showAlert).toHaveBeenCalled();
            expect(Storage.updateProxy).not.toHaveBeenCalled();
        });

        it('should accept valid port 1', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Proxy', 'proxy.example.com', 8080, 'http'),
            ]);

            await ProxyList.init();

            const editBtn = document.querySelector('.edit-proxy-btn') as HTMLButtonElement;
            editBtn.click();

            const portInput = document.querySelector('input[name="port"]') as HTMLInputElement;
            portInput.value = '1';

            const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
            saveBtn.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(Storage.updateProxy).toHaveBeenCalledWith('proxy-1', expect.objectContaining({
                port: 1,
            }));
        });

        it('should accept valid port 65535', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Proxy', 'proxy.example.com', 8080, 'http'),
            ]);

            await ProxyList.init();

            const editBtn = document.querySelector('.edit-proxy-btn') as HTMLButtonElement;
            editBtn.click();

            const portInput = document.querySelector('input[name="port"]') as HTMLInputElement;
            portInput.value = '65535';

            const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
            saveBtn.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(Storage.updateProxy).toHaveBeenCalledWith('proxy-1', expect.objectContaining({
                port: 65535,
            }));
        });

        it('should update host and port together', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Proxy', 'old.example.com', 8080, 'http'),
            ]);

            await ProxyList.init();

            const editBtn = document.querySelector('.edit-proxy-btn') as HTMLButtonElement;
            editBtn.click();

            const hostInput = document.querySelector('input[name="host"]') as HTMLInputElement;
            hostInput.value = 'new.example.com';

            const portInput = document.querySelector('input[name="port"]') as HTMLInputElement;
            portInput.value = '3128';

            const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
            saveBtn.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(Storage.updateProxy).toHaveBeenCalledWith('proxy-1', expect.objectContaining({
                host: 'new.example.com',
                port: 3128,
            }));
        });

        it('should trim whitespace from name and host', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Proxy', 'proxy.example.com', 8080, 'http'),
            ]);

            await ProxyList.init();

            const editBtn = document.querySelector('.edit-proxy-btn') as HTMLButtonElement;
            editBtn.click();

            const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement;
            nameInput.value = '  Trimmed Name  ';

            const hostInput = document.querySelector('input[name="host"]') as HTMLInputElement;
            hostInput.value = '  trimmed.host.com  ';

            const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
            saveBtn.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(Storage.updateProxy).toHaveBeenCalledWith('proxy-1', expect.objectContaining({
                name: 'Trimmed Name',
                host: 'trimmed.host.com',
            }));
        });

        it('should save empty name as undefined', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Named Proxy', 'proxy.example.com', 8080, 'http'),
            ]);

            await ProxyList.init();

            const editBtn = document.querySelector('.edit-proxy-btn') as HTMLButtonElement;
            editBtn.click();

            const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement;
            nameInput.value = '';

            const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
            saveBtn.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(Storage.updateProxy).toHaveBeenCalledWith('proxy-1', expect.objectContaining({
                name: undefined,
            }));
        });
    });

    describe('getProxyTypeLabel()', () => {
        it('should display correct labels for proxy types', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'HTTP Proxy', '127.0.0.1', 8080, 'http'),
                createProxy('proxy-2', 'HTTPS Proxy', '127.0.0.1', 8081, 'https'),
                createProxy('proxy-3', 'SOCKS4 Proxy', '127.0.0.1', 1080, 'socks4'),
                createProxy('proxy-4', 'SOCKS5 Proxy', '127.0.0.1', 1081, 'socks5'),
            ]);

            await ProxyList.init();

            const proxyDetails = document.querySelectorAll('.proxy-details');
            expect(proxyDetails[0].textContent).toContain('HTTP');
            expect(proxyDetails[1].textContent).toContain('HTTPS');
            expect(proxyDetails[2].textContent).toContain('SOCKS4');
            expect(proxyDetails[3].textContent).toContain('SOCKS5');
        });
    });

    describe('hasProxies()', () => {
        it('should return false when no proxies', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([]);

            await ProxyList.init();

            expect(ProxyList.hasProxies()).toBe(false);
        });

        it('should return true when proxies exist', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'Test Proxy', '127.0.0.1', 8080),
            ]);

            await ProxyList.init();

            expect(ProxyList.hasProxies()).toBe(true);
        });
    });

    describe('getProxies()', () => {
        it('should return loaded proxies', async () => {
            const testProxies = [
                createProxy('proxy-1', 'Test Proxy', '127.0.0.1', 8080),
            ];
            (Storage.getProxies as jest.Mock).mockResolvedValue(testProxies);

            await ProxyList.init();

            expect(ProxyList.getProxies()).toEqual(testProxies);
        });
    });

    describe('refresh()', () => {
        it('should reload proxies and re-render', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([]);

            await ProxyList.init();

            // Изменяем данные
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', 'New Proxy', '127.0.0.1', 8080),
            ]);

            await ProxyList.refresh();

            const proxyItems = document.querySelectorAll('.proxy-item');
            expect(proxyItems.length).toBe(1);
        });
    });

    describe('openAddProxyForm()', () => {
        it('should open proxy type dialog', async () => {
            await ProxyList.init();

            ProxyList.openAddProxyForm();

            const modal = document.querySelector('.modal-overlay');
            expect(modal).not.toBeNull();
        });
    });

    describe('escapeHtml()', () => {
        it('should escape HTML in proxy names', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                createProxy('proxy-1', '<script>alert("xss")</script>', '127.0.0.1', 8080),
            ]);

            await ProxyList.init();

            const proxyName = document.querySelector('.proxy-name');
            // HTML должен быть экранирован, поэтому содержит < вместо <
            expect(proxyName?.innerHTML).not.toContain('<script>');
        });
    });

    describe('countryCodeToFlag()', () => {
        it('should convert US country code to US flag emoji', () => {
            const result = (ProxyList as any).countryCodeToFlag('US');
            expect(result).toBe('🇺🇸');
        });

        it('should convert RU country code to Russian flag emoji', () => {
            const result = (ProxyList as any).countryCodeToFlag('RU');
            expect(result).toBe('🇷🇺');
        });

        it('should convert DE country code to German flag emoji', () => {
            const result = (ProxyList as any).countryCodeToFlag('DE');
            expect(result).toBe('🇩🇪');
        });

        it('should handle lowercase country codes', () => {
            const result = (ProxyList as any).countryCodeToFlag('gb');
            expect(result).toBe('🇬🇧');
        });
    });

    describe('normalizeProxies()', () => {
        it('should normalize proxies from PublicProxiesResponse format', () => {
            const response = {
                http: [
                    { ip: '192.168.1.1:8080', score: 4.5, type: 'Residential', country: 'US' },
                ],
                https: [
                    { ip: '192.168.1.2:443', score: 4.0, type: 'Corporate', country: 'DE' },
                ],
                socks4: [],
                socks5: [
                    { ip: '192.168.1.3:1080', score: 3.5, type: 'Mobile', country: 'RU' },
                ],
            };

            const result = (ProxyList as any).normalizeProxies(response);

            expect(result.length).toBe(3);
            expect(result[0].score).toBe(4.5);
            expect(result[0].protocol).toBe('http');
            expect(result[0].ip).toBe('192.168.1.1');
            expect(result[0].port).toBe(8080);
            expect(result[0].connectionType).toBe('residential');
            expect(result[0].country).toBe('US');
        });

        it('should sort proxies by score descending', () => {
            const response = {
                http: [
                    { ip: '1.1.1.1:8080', score: 3.0, type: 'Residential', country: 'US' },
                ],
                https: [
                    { ip: '2.2.2.2:443', score: 5.0, type: 'Corporate', country: 'DE' },
                ],
                socks4: [],
                socks5: [
                    { ip: '3.3.3.3:1080', score: 4.0, type: 'Mobile', country: 'RU' },
                ],
            };

            const result = (ProxyList as any).normalizeProxies(response);

            expect(result[0].score).toBe(5.0);
            expect(result[1].score).toBe(4.0);
            expect(result[2].score).toBe(3.0);
        });

        it('should skip invalid ip:port format', () => {
            const response = {
                http: [
                    { ip: 'invalid-format', score: 4.5, type: 'Residential', country: 'US' },
                    { ip: '192.168.1.1:8080', score: 4.0, type: 'Residential', country: 'US' },
                ],
                https: [],
                socks4: [],
                socks5: [],
            };

            const result = (ProxyList as any).normalizeProxies(response);

            expect(result.length).toBe(1);
            expect(result[0].ip).toBe('192.168.1.1');
        });

        it('should handle empty response', () => {
            const response = {
                http: [],
                https: [],
                socks4: [],
                socks5: [],
            };

            const result = (ProxyList as any).normalizeProxies(response);

            expect(result.length).toBe(0);
        });

        it('should handle missing protocol arrays', () => {
            const response = {
                http: [
                    { ip: '192.168.1.1:8080', score: 4.5, type: 'Residential', country: 'US' },
                ],
            } as any;

            const result = (ProxyList as any).normalizeProxies(response);

            expect(result.length).toBe(1);
        });
    });

    describe('filterPublicProxies()', () => {
        const testProxies = [
            { protocol: 'http', ip: '192.168.1.1', port: 8080, score: 4.5, connectionType: 'residential', country: 'US' },
            { protocol: 'https', ip: '192.168.1.2', port: 443, score: 4.0, connectionType: 'corporate', country: 'DE' },
            { protocol: 'socks5', ip: '192.168.1.3', port: 1080, score: 3.5, connectionType: 'mobile', country: 'RU' },
            { protocol: 'http', ip: '10.0.0.1', port: 3128, score: 4.8, connectionType: 'residential', country: 'US' },
        ];

        it('should return all proxies when no filters applied', () => {
            const result = (ProxyList as any).filterPublicProxies(testProxies, {}, '');
            expect(result.length).toBe(4);
        });

        it('should filter by protocol', () => {
            const result = (ProxyList as any).filterPublicProxies(testProxies, { protocol: 'http' }, '');
            expect(result.length).toBe(2);
            expect(result.every((p: any) => p.protocol === 'http')).toBe(true);
        });

        it('should filter by connectionType', () => {
            const result = (ProxyList as any).filterPublicProxies(testProxies, { connectionType: 'residential' }, '');
            expect(result.length).toBe(2);
            expect(result.every((p: any) => p.connectionType === 'residential')).toBe(true);
        });

        it('should filter by country', () => {
            const result = (ProxyList as any).filterPublicProxies(testProxies, { country: 'US' }, '');
            expect(result.length).toBe(2);
            expect(result.every((p: any) => p.country === 'US')).toBe(true);
        });

        it('should filter by minScore', () => {
            const result = (ProxyList as any).filterPublicProxies(testProxies, { minScore: 4.0 }, '');
            expect(result.length).toBe(3);
            expect(result.every((p: any) => p.score >= 4.0)).toBe(true);
        });

        it('should filter by search query (IP)', () => {
            const result = (ProxyList as any).filterPublicProxies(testProxies, {}, '192.168');
            expect(result.length).toBe(3);
        });

        it('should combine multiple filters', () => {
            const result = (ProxyList as any).filterPublicProxies(
                testProxies,
                { protocol: 'http', country: 'US', minScore: 4.5 },
                ''
            );
            expect(result.length).toBe(2);
        });

        it('should return empty array when no matches', () => {
            const result = (ProxyList as any).filterPublicProxies(testProxies, { country: 'JP' }, '');
            expect(result.length).toBe(0);
        });

        it('should be case-insensitive for search query', () => {
            const result = (ProxyList as any).filterPublicProxies(testProxies, {}, '10.0');
            expect(result.length).toBe(1);
            expect(result[0].ip).toBe('10.0.0.1');
        });
    });

    describe('Public proxies modal', () => {
        const mockPublicProxiesResponse = {
            http: [
                { ip: '192.168.1.1:8080', score: 4.5, type: 'Residential', country: 'US' },
                { ip: '192.168.1.2:3128', score: 4.0, type: 'Corporate', country: 'DE' },
            ],
            https: [
                { ip: '10.0.0.1:443', score: 4.8, type: 'Residential', country: 'US' },
            ],
            socks4: [],
            socks5: [
                { ip: '172.16.0.1:1080', score: 3.5, type: 'Mobile', country: 'RU' },
            ],
        };

        beforeEach(() => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockPublicProxiesResponse),
            });
        });

        afterEach(() => {
            (global.fetch as jest.Mock).mockRestore();
            (ProxyList as any).publicProxiesCache = null;
        });

        it('should open public proxies modal on second option click', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const modal = document.querySelector('.public-proxies-modal');
            expect(modal).not.toBeNull();
        });

        it('should show warning message in public proxies modal', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const warning = document.querySelector('.public-proxies-warning');
            expect(warning).not.toBeNull();
        });

        it('should show filters in public proxies modal', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(document.querySelector('#filter-protocol')).not.toBeNull();
            expect(document.querySelector('#filter-connection-type')).not.toBeNull();
            expect(document.querySelector('#filter-country')).not.toBeNull();
            expect(document.querySelector('#filter-min-score')).not.toBeNull();
        });

        it('should load and render public proxies', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const proxyItems = document.querySelectorAll('.public-proxy-item');
            expect(proxyItems.length).toBe(4);
        });

        it('should populate country filter with unique countries', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const countrySelect = document.querySelector('#filter-country') as HTMLSelectElement;
            const options = countrySelect.querySelectorAll('option');
            expect(options.length).toBeGreaterThan(1);
        });

        it('should filter proxies by protocol', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const protocolSelect = document.querySelector('#filter-protocol') as HTMLSelectElement;
            protocolSelect.value = 'http';
            protocolSelect.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 50));

            const proxyItems = document.querySelectorAll('.public-proxy-item');
            expect(proxyItems.length).toBe(2);
        });

        it('should filter proxies by search query', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const searchInput = document.querySelector('.public-proxy-search-input') as HTMLInputElement;
            searchInput.value = '192.168';
            searchInput.dispatchEvent(new Event('input'));

            await new Promise(resolve => setTimeout(resolve, 50));

            const proxyItems = document.querySelectorAll('.public-proxy-item');
            expect(proxyItems.length).toBe(2);
        });

        it('should close modal on close button click', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const closeBtn = document.querySelector('.modal-close') as HTMLButtonElement;
            closeBtn.click();

            expect(document.querySelector('.public-proxies-modal')).toBeNull();
        });

        it('should close modal on overlay click', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const overlay = document.querySelector('.modal-overlay') as HTMLElement;
            overlay.click();

            expect(document.querySelector('.public-proxies-modal')).toBeNull();
        });

        it('should add proxy to list on click', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const proxyItem = document.querySelector('.public-proxy-item') as HTMLElement;
            proxyItem.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(Storage.addProxy).toHaveBeenCalled();
        });

        it('should show error state on fetch failure', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
            });
            (ProxyList as any).publicProxiesCache = null;

            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const errorState = document.querySelector('.error-state');
            expect(errorState).not.toBeNull();
        });

        it('should show retry button on error', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
            });
            (ProxyList as any).publicProxiesCache = null;

            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const retryBtn = document.querySelector('.retry-btn');
            expect(retryBtn).not.toBeNull();
        });

        it('should retry loading on retry button click', async () => {
            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({ ok: false })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockPublicProxiesResponse),
                });
            (ProxyList as any).publicProxiesCache = null;

            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const retryBtn = document.querySelector('.retry-btn') as HTMLButtonElement;
            retryBtn.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('should use cached proxies on second open', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const closeBtn = document.querySelector('.modal-close') as HTMLButtonElement;
            closeBtn.click();

            addBtn.click();
            const publicOption2 = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption2.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        it('should show empty state when no proxies match filters', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const searchInput = document.querySelector('.public-proxy-search-input') as HTMLInputElement;
            searchInput.value = 'nonexistent';
            searchInput.dispatchEvent(new Event('input'));

            await new Promise(resolve => setTimeout(resolve, 50));

            const emptyState = document.querySelector('.empty-state');
            expect(emptyState).not.toBeNull();
        });

        it('should display proxy score with correct class', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const highScore = document.querySelector('.score-value.high');
            expect(highScore).not.toBeNull();
        });

        it('should display proxy country with flag', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const countrySpan = document.querySelector('.proxy-item-country');
            expect(countrySpan?.textContent).toContain('🇺🇸');
        });

        it('should filter by connection type', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const typeSelect = document.querySelector('#filter-connection-type') as HTMLSelectElement;
            typeSelect.value = 'residential';
            typeSelect.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 50));

            const proxyItems = document.querySelectorAll('.public-proxy-item');
            expect(proxyItems.length).toBe(2);
        });

        it('should filter by minimum score', async () => {
            await ProxyList.init();

            const addBtn = document.querySelector('.add-proxy-btn') as HTMLButtonElement;
            addBtn.click();

            const publicOption = document.querySelector('[data-type="public"]') as HTMLButtonElement;
            publicOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const scoreSelect = document.querySelector('#filter-min-score') as HTMLSelectElement;
            scoreSelect.value = '4.5';
            scoreSelect.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 50));

            const proxyItems = document.querySelectorAll('.public-proxy-item');
            expect(proxyItems.length).toBe(2);
        });
    });

    describe('getFiltersFromModal()', () => {
        it('should extract filters from modal elements', async () => {
            const modal = document.createElement('div');
            modal.innerHTML = `
                <select id="filter-protocol"><option value="http" selected>HTTP</option></select>
                <select id="filter-connection-type"><option value="residential" selected>Residential</option></select>
                <select id="filter-country"><option value="US" selected>US</option></select>
                <select id="filter-min-score"><option value="4.0" selected>4.0+</option></select>
            `;

            const result = (ProxyList as any).getFiltersFromModal(modal);

            expect(result.protocol).toBe('http');
            expect(result.connectionType).toBe('residential');
            expect(result.country).toBe('US');
            expect(result.minScore).toBe(4.0);
        });

        it('should return undefined for empty filter values', async () => {
            const modal = document.createElement('div');
            modal.innerHTML = `
                <select id="filter-protocol"><option value="" selected>All</option></select>
                <select id="filter-connection-type"><option value="" selected>All</option></select>
                <select id="filter-country"><option value="" selected>All</option></select>
                <select id="filter-min-score"><option value="0" selected>All</option></select>
            `;

            const result = (ProxyList as any).getFiltersFromModal(modal);

            expect(result.protocol).toBeUndefined();
            expect(result.connectionType).toBeUndefined();
            expect(result.country).toBeUndefined();
            expect(result.minScore).toBeUndefined();
        });
    });

    describe('getConnectionTypeLabel()', () => {
        it('should return translated label for residential', () => {
            const result = (ProxyList as any).getConnectionTypeLabel('residential');
            expect(result).toBe('connectionTypeResidential');
        });

        it('should return translated label for corporate', () => {
            const result = (ProxyList as any).getConnectionTypeLabel('corporate');
            expect(result).toBe('connectionTypeCorporate');
        });

        it('should return translated label for mobile', () => {
            const result = (ProxyList as any).getConnectionTypeLabel('mobile');
            expect(result).toBe('connectionTypeMobile');
        });

        it('should return original type for unknown types', () => {
            const result = (ProxyList as any).getConnectionTypeLabel('unknown');
            expect(result).toBe('unknown');
        });
    });

    describe('createPublicProxyItem()', () => {
        it('should create element with proxy data', () => {
            const proxy = {
                protocol: 'http',
                ip: '192.168.1.1',
                port: 8080,
                score: 4.5,
                connectionType: 'residential',
                country: 'US',
            };
            const closeModal = jest.fn();

            const item = (ProxyList as any).createPublicProxyItem(proxy, closeModal);

            expect(item.className).toBe('public-proxy-item');
            expect(item.querySelector('.proxy-item-address')?.textContent).toBe('192.168.1.1:8080');
            expect(item.querySelector('.proxy-item-protocol')?.textContent).toBe('HTTP');
        });

        it('should apply high score class for score >= 4.5', () => {
            const proxy = {
                protocol: 'http',
                ip: '192.168.1.1',
                port: 8080,
                score: 4.5,
                connectionType: 'residential',
                country: 'US',
            };
            const closeModal = jest.fn();

            const item = (ProxyList as any).createPublicProxyItem(proxy, closeModal);

            expect(item.querySelector('.score-value')?.classList.contains('high')).toBe(true);
        });

        it('should apply medium score class for score >= 4.0 and < 4.5', () => {
            const proxy = {
                protocol: 'http',
                ip: '192.168.1.1',
                port: 8080,
                score: 4.2,
                connectionType: 'residential',
                country: 'US',
            };
            const closeModal = jest.fn();

            const item = (ProxyList as any).createPublicProxyItem(proxy, closeModal);

            expect(item.querySelector('.score-value')?.classList.contains('medium')).toBe(true);
        });

        it('should apply low score class for score < 4.0', () => {
            const proxy = {
                protocol: 'http',
                ip: '192.168.1.1',
                port: 8080,
                score: 3.5,
                connectionType: 'residential',
                country: 'US',
            };
            const closeModal = jest.fn();

            const item = (ProxyList as any).createPublicProxyItem(proxy, closeModal);

            expect(item.querySelector('.score-value')?.classList.contains('low')).toBe(true);
        });
    });

    describe('addPublicProxyToList()', () => {
        it('should add proxy with correct data when proxies exist', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                { id: 'proxy-1', name: 'Existing', host: '127.0.0.1', port: 8080, type: 'http', isDefault: true },
            ]);
            await ProxyList.init();

            const publicProxy = {
                protocol: 'socks5' as const,
                ip: '192.168.1.1',
                port: 1080,
                score: 4.5,
                connectionType: 'residential',
                country: 'US',
            };

            await (ProxyList as any).addPublicProxyToList(publicProxy);

            expect(Storage.addProxy).toHaveBeenCalledWith({
                name: '🇺🇸 US - 192.168.1.1',
                type: 'socks5',
                host: '192.168.1.1',
                port: 1080,
                isDefault: false,
            });
        });

        it('should set isDefault true when no proxies exist', async () => {
            (Storage.getProxies as jest.Mock).mockResolvedValue([]);
            await ProxyList.init();

            const publicProxy = {
                protocol: 'http' as const,
                ip: '10.0.0.1',
                port: 8080,
                score: 4.0,
                connectionType: 'corporate',
                country: 'DE',
            };

            await (ProxyList as any).addPublicProxyToList(publicProxy);

            expect(Storage.addProxy).toHaveBeenCalledWith(expect.objectContaining({
                isDefault: true,
            }));
        });
    });

    describe('renderPublicProxiesList()', () => {
        it('should show empty state when no proxies', () => {
            const container = document.createElement('div');
            const closeModal = jest.fn();

            (ProxyList as any).renderPublicProxiesList(container, [], closeModal);

            expect(container.querySelector('.empty-state')).not.toBeNull();
        });

        it('should render proxies list', () => {
            const container = document.createElement('div');
            const closeModal = jest.fn();
            const proxies = [
                { protocol: 'http', ip: '192.168.1.1', port: 8080, score: 4.5, connectionType: 'residential', country: 'US' },
                { protocol: 'https', ip: '192.168.1.2', port: 443, score: 4.0, connectionType: 'corporate', country: 'DE' },
            ];

            (ProxyList as any).renderPublicProxiesList(container, proxies, closeModal);

            const items = container.querySelectorAll('.public-proxy-item');
            expect(items.length).toBe(2);
        });
    });
});
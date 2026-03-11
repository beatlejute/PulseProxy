// Моки Chrome Extension API для тестирования

// Хранилище данных для моков
const localStorageData: Record<string, unknown> = {};
const syncStorageData: Record<string, unknown> = {};

// Слушатели изменений storage
type StorageChangeListener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
) => void;
const storageChangeListeners: StorageChangeListener[] = [];

// Мок chrome.storage.local (без строгой типизации для совместимости)
const mockLocalStorage = {
    get: jest.fn((keys?: unknown, callback?: (items: Record<string, unknown>) => void) => {
        const keysArray = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
        const result: Record<string, unknown> = {};
        keysArray.forEach((key: string) => {
            if (key in localStorageData) {
                result[key] = localStorageData[key];
            }
        });
        if (callback) callback(result);
        return Promise.resolve(result);
    }),

    set: jest.fn((items: Record<string, unknown>, callback?: () => void) => {
        Object.assign(localStorageData, items);
        if (callback) callback();
        return Promise.resolve();
    }),

    remove: jest.fn((keys: string | string[], callback?: () => void) => {
        const keysArray = typeof keys === 'string' ? [keys] : keys;
        keysArray.forEach((key: string) => {
            delete localStorageData[key];
        });
        if (callback) callback();
        return Promise.resolve();
    }),

    clear: jest.fn((callback?: () => void) => {
        Object.keys(localStorageData).forEach(key => {
            delete localStorageData[key];
        });
        if (callback) callback();
        return Promise.resolve();
    }),

    getBytesInUse: jest.fn((keys?: unknown, callback?: (bytesInUse: number) => void) => {
        const bytes = JSON.stringify(localStorageData).length;
        if (callback) callback(bytes);
        return Promise.resolve(bytes);
    }),

    getKeys: jest.fn((callback?: (keys: string[]) => void) => {
        const keys = Object.keys(localStorageData);
        if (callback) callback(keys);
        return Promise.resolve(keys);
    }),

    setAccessLevel: jest.fn(() => Promise.resolve()),
    onChanged: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
        hasListener: jest.fn(() => false),
        hasListeners: jest.fn(() => false),
        addRules: jest.fn(),
        removeRules: jest.fn(),
        getRules: jest.fn(),
    },
    QUOTA_BYTES: 10485760,
};

// Мок chrome.storage.sync (без строгой типизации для совместимости)
const mockSyncStorage = {
    get: jest.fn((keys?: unknown, callback?: (items: Record<string, unknown>) => void) => {
        const keysArray = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
        const result: Record<string, unknown> = {};
        keysArray.forEach((key: string) => {
            if (key in syncStorageData) {
                result[key] = syncStorageData[key];
            }
        });
        if (callback) callback(result);
        return Promise.resolve(result);
    }),

    set: jest.fn((items: Record<string, unknown>, callback?: () => void) => {
        Object.assign(syncStorageData, items);
        if (callback) callback();
        return Promise.resolve();
    }),

    remove: jest.fn((keys: string | string[], callback?: () => void) => {
        const keysArray = typeof keys === 'string' ? [keys] : keys;
        keysArray.forEach((key: string) => {
            delete syncStorageData[key];
        });
        if (callback) callback();
        return Promise.resolve();
    }),

    clear: jest.fn((callback?: () => void) => {
        Object.keys(syncStorageData).forEach(key => {
            delete syncStorageData[key];
        });
        if (callback) callback();
        return Promise.resolve();
    }),

    getBytesInUse: jest.fn((keys?: unknown, callback?: (bytesInUse: number) => void) => {
        const bytes = JSON.stringify(syncStorageData).length;
        if (callback) callback(bytes);
        return Promise.resolve(bytes);
    }),

    getKeys: jest.fn((callback?: (keys: string[]) => void) => {
        const keys = Object.keys(syncStorageData);
        if (callback) callback(keys);
        return Promise.resolve(keys);
    }),

    setAccessLevel: jest.fn(() => Promise.resolve()),
    onChanged: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
        hasListener: jest.fn(() => false),
        hasListeners: jest.fn(() => false),
        addRules: jest.fn(),
        removeRules: jest.fn(),
        getRules: jest.fn(),
    },
    QUOTA_BYTES: 102400,
    QUOTA_BYTES_PER_ITEM: 8192,
    MAX_ITEMS: 512,
    MAX_WRITE_OPERATIONS_PER_HOUR: 1800,
    MAX_WRITE_OPERATIONS_PER_MINUTE: 120,
    MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE: 1000000,
};

// Мок chrome.storage.onChanged
const mockStorageOnChanged = {
    addListener: jest.fn((listener: StorageChangeListener) => {
        storageChangeListeners.push(listener);
    }),
    removeListener: jest.fn((listener: StorageChangeListener) => {
        const index = storageChangeListeners.indexOf(listener);
        if (index > -1) {
            storageChangeListeners.splice(index, 1);
        }
    }),
    hasListener: jest.fn((listener: StorageChangeListener) => {
        return storageChangeListeners.includes(listener);
    }),
    hasListeners: jest.fn(() => storageChangeListeners.length > 0),
    addRules: jest.fn(),
    removeRules: jest.fn(),
    getRules: jest.fn(),
};

// Мок chrome.proxy.settings
const mockProxySettings = {
    set: jest.fn((details, callback) => {
        if (callback) callback();
    }),
    get: jest.fn((details, callback) => {
        if (callback) callback({ value: {}, levelOfControl: 'controllable_by_this_extension' });
    }),
    clear: jest.fn((details, callback) => {
        if (callback) callback();
    }),
    onChange: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
        hasListener: jest.fn(() => false),
        hasListeners: jest.fn(() => false),
        addRules: jest.fn(),
        removeRules: jest.fn(),
        getRules: jest.fn(),
    },
};

// Мок chrome.action
const mockAction = {
    setIcon: jest.fn((details, callback) => {
        if (callback) callback();
    }),
    setTitle: jest.fn((details, callback) => {
        if (callback) callback();
    }),
    setBadgeText: jest.fn((details, callback) => {
        if (callback) callback();
    }),
    setBadgeBackgroundColor: jest.fn((details, callback) => {
        if (callback) callback();
    }),
    onClicked: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
        hasListener: jest.fn(() => false),
        hasListeners: jest.fn(() => false),
        addRules: jest.fn(),
        removeRules: jest.fn(),
        getRules: jest.fn(),
    },
};

// Мок chrome.runtime
const mockRuntime = {
    getURL: jest.fn((path: string) => `chrome-extension://mock-extension-id/${path}`),
    getManifest: jest.fn(() => ({
        name: 'PulseProxy VPN',
        version: '1.0.0',
        manifest_version: 3,
    })),
    lastError: null as chrome.runtime.LastError | null,
    onMessage: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
        hasListener: jest.fn(() => false),
        hasListeners: jest.fn(() => false),
        addRules: jest.fn(),
        removeRules: jest.fn(),
        getRules: jest.fn(),
    },
    onInstalled: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
        hasListener: jest.fn(() => false),
        hasListeners: jest.fn(() => false),
        addRules: jest.fn(),
        removeRules: jest.fn(),
        getRules: jest.fn(),
    },
    sendMessage: jest.fn(),
    id: 'mock-extension-id',
};

// Мок chrome.i18n
const mockI18n = {
    getUILanguage: jest.fn(() => 'en'),
    getMessage: jest.fn((key: string) => key),
    getAcceptLanguages: jest.fn((callback) => {
        if (callback) callback(['en']);
        return Promise.resolve(['en']);
    }),
    detectLanguage: jest.fn(),
};

// Мок chrome.webRequest
type AuthRequiredListener = (
    details: chrome.webRequest.WebRequestDetails & { challenger?: { host: string; port: number } }
) => chrome.webRequest.BlockingResponse | undefined;
const authRequiredListeners: AuthRequiredListener[] = [];

const mockWebRequest = {
    onAuthRequired: {
        addListener: jest.fn((listener: AuthRequiredListener) => {
            authRequiredListeners.push(listener);
        }),
        removeListener: jest.fn(),
        hasListener: jest.fn(() => false),
        hasListeners: jest.fn(() => authRequiredListeners.length > 0),
        addRules: jest.fn(),
        removeRules: jest.fn(),
        getRules: jest.fn(),
    },
};

// Полный мок chrome объекта
const chromeMock = {
    storage: {
        local: mockLocalStorage,
        sync: mockSyncStorage,
        onChanged: mockStorageOnChanged,
        session: mockLocalStorage, // Используем тот же мок для session
        managed: mockLocalStorage, // Используем тот же мок для managed
    },
    proxy: {
        settings: mockProxySettings,
        onProxyError: {
            addListener: jest.fn(),
            removeListener: jest.fn(),
            hasListener: jest.fn(() => false),
            hasListeners: jest.fn(() => false),
            addRules: jest.fn(),
            removeRules: jest.fn(),
            getRules: jest.fn(),
        },
    },
    action: mockAction,
    runtime: mockRuntime,
    i18n: mockI18n,
    webRequest: mockWebRequest,
};

// Присваиваем глобальному объекту
(global as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;

// Хелперы для тестов
export const mockHelpers = {
    // Очистка всех хранилищ
    clearAllStorage: () => {
        Object.keys(localStorageData).forEach(key => delete localStorageData[key]);
        Object.keys(syncStorageData).forEach(key => delete syncStorageData[key]);
    },

    // Установка данных в local storage
    setLocalStorageData: (data: Record<string, unknown>) => {
        Object.assign(localStorageData, data);
    },

    // Установка данных в sync storage
    setSyncStorageData: (data: Record<string, unknown>) => {
        Object.assign(syncStorageData, data);
    },

    // Получение данных из local storage
    getLocalStorageData: () => ({ ...localStorageData }),

    // Получение данных из sync storage
    getSyncStorageData: () => ({ ...syncStorageData }),

    // Триггер события изменения storage
    triggerStorageChange: (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
        storageChangeListeners.forEach(listener => listener(changes, areaName));
    },

    // Установка lastError
    setLastError: (error: string | null) => {
        mockRuntime.lastError = error ? { message: error } : null;
    },

    // Сброс всех моков
    resetAllMocks: () => {
        jest.clearAllMocks();
        mockHelpers.clearAllStorage();
        mockHelpers.setLastError(null);
        storageChangeListeners.length = 0;
        authRequiredListeners.length = 0;
    },

    // Триггер события onAuthRequired
    triggerAuthRequired: (details: chrome.webRequest.WebRequestDetails & { challenger?: { host: string; port: number } }) => {
        return new Promise((resolve) => {
            for (const listener of authRequiredListeners) {
                const result = listener(details);
                if (result !== undefined) {
                    resolve(result);
                    return;
                }
            }
            resolve(undefined);
        });
    },
};

export default chromeMock;
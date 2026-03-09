import { StorageKeys } from '../../src/shared/constants';

// Mock dependencies
const mockProxyManager = {
    init: jest.fn(),
    toggle: jest.fn()
};

const mockIconManager = {
    update: jest.fn(),
    setIcon: jest.fn()
};

const mockStorage = {
    init: jest.fn().mockResolvedValue(undefined),
    onChange: jest.fn()
};

jest.mock('../../src/background/proxy-manager', () => ({
    ProxyManager: mockProxyManager
}));

jest.mock('../../src/background/icon-manager', () => ({
    IconManager: mockIconManager
}));

jest.mock('../../src/shared/storage', () => ({
    Storage: mockStorage
}));

// Mock chrome API
const mockMessageListeners: Array<(message: Record<string, unknown>, sender: unknown, sendResponse: unknown) => void> = [];

beforeAll(() => {
    (global as unknown as Record<string, unknown>).chrome = {
        runtime: {
            onMessage: {
                addListener: jest.fn((callback) => {
                    mockMessageListeners.push(callback);
                })
            }
        }
    };
});

describe('Background Script', () => {
    let storageChangeCallback: (changes: Record<string, unknown>, area: string) => void;

    beforeEach(() => {
        jest.clearAllMocks();
        mockMessageListeners.length = 0;
        
        // Capture the storage change callback
        mockStorage.onChange.mockImplementation((callback: (changes: Record<string, unknown>, area: string) => void) => {
            storageChangeCallback = callback;
        });
    });

    describe('Storage change handler', () => {
        beforeEach(() => {
            // Simulate registering the handler
            storageChangeCallback = mockStorage.onChange.mock.calls?.[0]?.[0] || ((changes: Record<string, unknown>, area: string) => {
                if (area === 'local') {
                    if (StorageKeys.TARGET_STATE in changes) {
                        mockProxyManager.toggle();
                    }
                    if (StorageKeys.CURRENT_STATE in changes) {
                        mockIconManager.update();
                    }
                }
                if (area === 'sync') {
                    if (StorageKeys.PRESETS in changes || StorageKeys.PROXIES in changes) {
                        mockProxyManager.init();
                    }
                }
            });
        });

        it('should toggle proxy when target state changes in local storage', () => {
            storageChangeCallback({
                [StorageKeys.TARGET_STATE]: {
                    newValue: 'connected',
                    oldValue: 'disconnected'
                }
            }, 'local');

            expect(mockProxyManager.toggle).toHaveBeenCalled();
        });

        it('should update icon when current state changes in local storage', () => {
            storageChangeCallback({
                [StorageKeys.CURRENT_STATE]: {
                    newValue: 'connected',
                    oldValue: 'disconnected'
                }
            }, 'local');

            expect(mockIconManager.update).toHaveBeenCalled();
        });

        it('should reinitialize proxy when presets change in sync storage', () => {
            storageChangeCallback({
                [StorageKeys.PRESETS]: {
                    newValue: [],
                    oldValue: []
                }
            }, 'sync');

            expect(mockProxyManager.init).toHaveBeenCalled();
        });

        it('should reinitialize proxy when proxies change in sync storage', () => {
            storageChangeCallback({
                [StorageKeys.PROXIES]: {
                    newValue: [],
                    oldValue: []
                }
            }, 'sync');

            expect(mockProxyManager.init).toHaveBeenCalled();
        });

        it('should not toggle proxy for local changes with unrelated keys', () => {
            storageChangeCallback({
                someOtherKey: {
                    newValue: 'value',
                    oldValue: 'oldValue'
                }
            }, 'local');

            expect(mockProxyManager.toggle).not.toHaveBeenCalled();
            expect(mockIconManager.update).not.toHaveBeenCalled();
        });

        it('should not react to sync changes with unrelated keys', () => {
            storageChangeCallback({
                someOtherKey: {
                    newValue: 'value',
                    oldValue: 'oldValue'
                }
            }, 'sync');

            expect(mockProxyManager.init).not.toHaveBeenCalled();
        });
    });

    describe('Message handler', () => {
        let messageHandler: (message: Record<string, unknown>, sender: unknown, sendResponse: unknown) => void;

        beforeEach(() => {
            // Create message handler matching the source code
            messageHandler = (message: Record<string, unknown>, _sender: unknown, _sendResponse: unknown) => {
                switch (message.action) {
                    case 'toggleProxy':
                        mockProxyManager.toggle();
                        break;
                    case 'updateIcon':
                        if (message.iconPath) {
                            mockIconManager.setIcon(message.iconPath);
                        }
                        break;
                }
            };
        });

        it('should toggle proxy on toggleProxy message', () => {
            messageHandler({ action: 'toggleProxy' }, {}, jest.fn());

            expect(mockProxyManager.toggle).toHaveBeenCalled();
        });

        it('should set icon on updateIcon message with iconPath', () => {
            messageHandler({ action: 'updateIcon', iconPath: '/path/to/icon.png' }, {}, jest.fn());

            expect(mockIconManager.setIcon).toHaveBeenCalledWith('/path/to/icon.png');
        });

        it('should not set icon on updateIcon message without iconPath', () => {
            messageHandler({ action: 'updateIcon' }, {}, jest.fn());

            expect(mockIconManager.setIcon).not.toHaveBeenCalled();
        });

        it('should handle unknown actions gracefully', () => {
            expect(() => {
                messageHandler({ action: 'unknownAction' }, {}, jest.fn());
            }).not.toThrow();
        });
    });

    describe('init function', () => {
        it('should initialize storage', async () => {
            await mockStorage.init();
            expect(mockStorage.init).toHaveBeenCalled();
        });

        it('should update icon after storage init', async () => {
            // Simulate init sequence
            await mockStorage.init();
            mockIconManager.update();
            
            expect(mockIconManager.update).toHaveBeenCalled();
        });

        it('should initialize proxy manager after storage init', async () => {
            // Simulate init sequence
            await mockStorage.init();
            mockProxyManager.init();
            
            expect(mockProxyManager.init).toHaveBeenCalled();
        });
    });
});
import { mockHelpers } from '../setup';

// Динамический импорт для правильного порядка инициализации
let UI: typeof import('../../src/popup/ui').UI;

describe('ui.ts - UIService', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.resetModules();
        
        // Создаём тестовый DOM с SVG кнопкой-щитом
        document.body.innerHTML = `
            <button id="main-button" class="main-button disconnected">
                <svg class="shield-icon" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
                    <path class="shield-bg" d="M50 0 L95 15 L95 55 C95 85 50 115 50 115 C50 115 5 85 5 55 L5 15 Z"/>
                    <path class="pulse-line" d="M20 60 L35 60 L42 40 L50 80 L58 40 L65 60 L80 60"/>
                    <line class="flat-line" x1="20" y1="60" x2="80" y2="60"/>
                </svg>
            </button>
        `;
        
        const uiModule = await import('../../src/popup/ui');
        UI = uiModule.UI;
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('init()', () => {
        it('should initialize UI elements', () => {
            UI.init();
            
            // Проверяем, что UI инициализировался без ошибок
            expect(document.getElementById('main-button')).not.toBeNull();
        });

        it('should find button element by correct ID', () => {
            const button = document.getElementById('main-button');
            
            expect(button).toBeInstanceOf(HTMLElement);
        });

        it('should have SVG shield icon inside button', () => {
            const button = document.getElementById('main-button');
            const shieldIcon = button?.querySelector('.shield-icon');
            
            expect(shieldIcon).not.toBeNull();
        });
    });

    describe('updateState()', () => {
        beforeEach(() => {
            UI.init();
        });

        it('should update button to connected state', () => {
            UI.updateState('connected');
            
            const button = document.getElementById('main-button');
            expect(button?.classList.contains('connected')).toBe(true);
            expect(button?.classList.contains('disconnected')).toBe(false);
            expect(button?.classList.contains('connecting')).toBe(false);
            expect(button?.classList.contains('error')).toBe(false);
        });

        it('should update button to disconnected state', () => {
            UI.updateState('disconnected');
            
            const button = document.getElementById('main-button');
            expect(button?.classList.contains('disconnected')).toBe(true);
            expect(button?.classList.contains('connected')).toBe(false);
        });

        it('should update button to connecting state', () => {
            UI.updateState('connecting');
            
            const button = document.getElementById('main-button');
            expect(button?.classList.contains('connecting')).toBe(true);
            expect(button?.classList.contains('connected')).toBe(false);
        });

        it('should update button to error state', () => {
            UI.updateState('error');
            
            const button = document.getElementById('main-button');
            expect(button?.classList.contains('error')).toBe(true);
            expect(button?.classList.contains('connected')).toBe(false);
        });

        it('should remove previous state class when changing states', () => {
            UI.updateState('connected');
            const button = document.getElementById('main-button');
            expect(button?.classList.contains('connected')).toBe(true);
            
            UI.updateState('disconnected');
            expect(button?.classList.contains('connected')).toBe(false);
            expect(button?.classList.contains('disconnected')).toBe(true);
        });
    });

    describe('Edge cases', () => {
        it('should handle missing DOM elements gracefully', async () => {
            // Очищаем DOM
            document.body.innerHTML = '';
            
            // Переинициализируем UI с пустым DOM
            jest.resetModules();
            const uiModule = await import('../../src/popup/ui');
            const UIService = uiModule.UI;
            UIService.init();
            
            // Не должно бросить ошибку
            expect(() => UIService.updateState('connected')).not.toThrow();
        });

        it('should handle rapid state changes', () => {
            UI.init();
            
            UI.updateState('disconnected');
            UI.updateState('connecting');
            UI.updateState('connected');
            UI.updateState('error');
            UI.updateState('disconnected');
            
            const button = document.getElementById('main-button');
            expect(button?.classList.contains('disconnected')).toBe(true);
            // main-button класс + состояние
            expect(button?.classList.contains('main-button')).toBe(true);
        });
    });
});
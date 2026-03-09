// Глобальная настройка тестов Jest

// Импорт моков Chrome API
import { mockHelpers } from './__mocks__/chrome';

// Очистка моков перед каждым тестом
beforeEach(() => {
    mockHelpers.resetAllMocks();
});

// Мок для fetch API
global.fetch = jest.fn(() =>
    Promise.resolve({
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
        ok: true,
        status: 200,
    } as Response)
);

// Мок для window.confirm и window.alert (jsdom не реализует их)
global.confirm = jest.fn(() => true);
global.alert = jest.fn();

// Мок для Blob (используется в storage.ts для проверки размера)
class MockBlob {
    private content: string;
    
    constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        this.content = parts.join('');
    }
    
    get size(): number {
        return new TextEncoder().encode(this.content).length;
    }
}

global.Blob = MockBlob as unknown as typeof Blob;

// Мок для TextEncoder (если не определён)
if (typeof TextEncoder === 'undefined') {
    global.TextEncoder = class TextEncoder {
        encode(str: string): Uint8Array {
            const arr = new Uint8Array(str.length);
            for (let i = 0; i < str.length; i++) {
                arr[i] = str.charCodeAt(i);
            }
            return arr;
        }
    } as unknown as typeof TextEncoder;
}

// Мок для DragEvent (jsdom не реализует его)
class MockDragEvent extends Event {
    public dataTransfer: DataTransfer | null;
    public clientX: number;
    public clientY: number;
    
    constructor(type: string, eventInitDict?: DragEventInit) {
        super(type, eventInitDict);
        this.dataTransfer = eventInitDict?.dataTransfer || null;
        this.clientX = (eventInitDict as Record<string, number>)?.clientX || 0;
        this.clientY = (eventInitDict as Record<string, number>)?.clientY || 0;
    }
}

global.DragEvent = MockDragEvent as unknown as typeof DragEvent;

// Мок для DataTransfer (jsdom не реализует его полностью)
if (typeof DataTransfer === 'undefined') {
    class MockDataTransfer {
        private data: Map<string, string> = new Map();
        public effectAllowed: string = 'none';
        public dropEffect: string = 'none';
        
        setData(format: string, data: string): void {
            this.data.set(format, data);
        }
        
        getData(format: string): string {
            return this.data.get(format) || '';
        }
        
        clearData(): void {
            this.data.clear();
        }
    }
    
    global.DataTransfer = MockDataTransfer as unknown as typeof DataTransfer;
}

// Установка таймаута для тестов (опционально)
jest.setTimeout(10000);

// Экспорт для использования в тестах
export { mockHelpers };
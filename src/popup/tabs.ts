import { TabId } from '../types';

class TabsService {
    private activeTab: TabId | null = null;
    private segments: NodeListOf<Element> | null = null;
    private contents: NodeListOf<Element> | null = null;

    init(): void {
        this.segments = document.querySelectorAll('.segment');
        this.contents = document.querySelectorAll('.tab-content');
        this.bindEvents();
        // По умолчанию все закрыто - не вызываем switchTab
    }

    private bindEvents(): void {
        this.segments?.forEach(segment => {
            segment.addEventListener('click', () => {
                const tabId = segment.getAttribute('data-tab') as TabId;
                if (tabId) this.toggleTab(tabId);
            });
        });
    }

    toggleTab(tabId: TabId): void {
        // Если кликнули на уже активную вкладку - закрываем её
        if (this.activeTab === tabId) {
            this.closeAll();
            return;
        }
        
        // Иначе открываем новую вкладку
        this.activeTab = tabId;
        
        // Обновляем сегменты
        this.segments?.forEach(s => {
            s.classList.toggle('active', s.getAttribute('data-tab') === tabId);
        });
        
        // Обновляем контент
        this.contents?.forEach(c => {
            c.classList.toggle('active', c.id === `tab-${tabId}`);
        });
    }

    closeAll(): void {
        this.activeTab = null;
        
        // Убираем active со всех сегментов
        this.segments?.forEach(s => s.classList.remove('active'));
        
        // Скрываем весь контент
        this.contents?.forEach(c => c.classList.remove('active'));
    }

    getActiveTab(): TabId | null {
        return this.activeTab;
    }

    isOpen(): boolean {
        return this.activeTab !== null;
    }

    reset(): void {
        this.activeTab = null;
        this.segments = null;
        this.contents = null;
    }
}

export const Tabs = new TabsService();
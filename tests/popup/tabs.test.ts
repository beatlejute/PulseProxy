/**
 * @jest-environment jsdom
 */

import { Tabs } from '../../src/popup/tabs';

describe('TabsService', () => {
    function setupDOM() {
        document.body.innerHTML = `
            <div class="segments">
                <div class="segment" data-tab="proxies">Proxies</div>
                <div class="segment" data-tab="presets">Presets</div>
                <div class="segment" data-tab="settings">Settings</div>
            </div>
            <div class="tab-content" id="tab-proxies">Proxies Content</div>
            <div class="tab-content" id="tab-presets">Presets Content</div>
            <div class="tab-content" id="tab-settings">Settings Content</div>
        `;
    }

    beforeEach(() => {
        Tabs.reset();
        setupDOM();
    });

    describe('init()', () => {
        it('should find segments and contents', () => {
            Tabs.init();
            expect(Tabs.getActiveTab()).toBeNull();
        });

        it('should bind click events to segments', () => {
            Tabs.init();
            
            const segment = document.querySelector('[data-tab="proxies"]') as HTMLElement;
            segment.click();
            
            expect(Tabs.getActiveTab()).toBe('proxies');
        });

        it('should start with all tabs closed', () => {
            Tabs.init();
            
            expect(Tabs.isOpen()).toBe(false);
            expect(Tabs.getActiveTab()).toBeNull();
        });

        it('should work with empty DOM', () => {
            document.body.innerHTML = '';
            Tabs.init();
            
            expect(Tabs.getActiveTab()).toBeNull();
            expect(Tabs.isOpen()).toBe(false);
        });
    });

    describe('toggleTab()', () => {
        beforeEach(() => {
            Tabs.init();
        });

        it('should open a tab', () => {
            Tabs.toggleTab('proxies');
            
            expect(Tabs.getActiveTab()).toBe('proxies');
            expect(Tabs.isOpen()).toBe(true);
        });

        it('should add active class to segment', () => {
            Tabs.toggleTab('proxies');
            
            const segment = document.querySelector('[data-tab="proxies"]');
            expect(segment?.classList.contains('active')).toBe(true);
        });

        it('should add active class to content', () => {
            Tabs.toggleTab('proxies');
            
            const content = document.getElementById('tab-proxies');
            expect(content?.classList.contains('active')).toBe(true);
        });

        it('should close tab when clicking same tab', () => {
            Tabs.toggleTab('proxies');
            expect(Tabs.getActiveTab()).toBe('proxies');
            
            Tabs.toggleTab('proxies');
            expect(Tabs.getActiveTab()).toBeNull();
            expect(Tabs.isOpen()).toBe(false);
        });

        it('should switch between tabs', () => {
            Tabs.toggleTab('proxies');
            expect(Tabs.getActiveTab()).toBe('proxies');
            
            Tabs.toggleTab('presets');
            expect(Tabs.getActiveTab()).toBe('presets');
        });

        it('should remove active from previous tab when switching', () => {
            Tabs.toggleTab('proxies');
            Tabs.toggleTab('presets');
            
            const proxiesSegment = document.querySelector('[data-tab="proxies"]');
            const presetsSegment = document.querySelector('[data-tab="presets"]');
            
            expect(proxiesSegment?.classList.contains('active')).toBe(false);
            expect(presetsSegment?.classList.contains('active')).toBe(true);
        });

        it('should remove active from previous content when switching', () => {
            Tabs.toggleTab('proxies');
            Tabs.toggleTab('presets');
            
            const proxiesContent = document.getElementById('tab-proxies');
            const presetsContent = document.getElementById('tab-presets');
            
            expect(proxiesContent?.classList.contains('active')).toBe(false);
            expect(presetsContent?.classList.contains('active')).toBe(true);
        });

        it('should handle non-existent tab gracefully', () => {
            Tabs.toggleTab('nonexistent' as any);
            
            expect(Tabs.getActiveTab()).toBe('nonexistent');
            const activeContent = document.querySelector('.tab-content.active');
            expect(activeContent).toBeNull();
        });
    });

    describe('closeAll()', () => {
        beforeEach(() => {
            Tabs.init();
        });

        it('should close active tab', () => {
            Tabs.toggleTab('proxies');
            Tabs.closeAll();
            
            expect(Tabs.getActiveTab()).toBeNull();
            expect(Tabs.isOpen()).toBe(false);
        });

        it('should remove active class from all segments', () => {
            Tabs.toggleTab('proxies');
            Tabs.closeAll();
            
            const activeSegments = document.querySelectorAll('.segment.active');
            expect(activeSegments.length).toBe(0);
        });

        it('should remove active class from all contents', () => {
            Tabs.toggleTab('proxies');
            Tabs.closeAll();
            
            const activeContents = document.querySelectorAll('.tab-content.active');
            expect(activeContents.length).toBe(0);
        });

        it('should work when no tab is open', () => {
            Tabs.closeAll();
            
            expect(Tabs.getActiveTab()).toBeNull();
            expect(Tabs.isOpen()).toBe(false);
        });
    });

    describe('getActiveTab()', () => {
        beforeEach(() => {
            Tabs.init();
        });

        it('should return null when no tab is active', () => {
            expect(Tabs.getActiveTab()).toBeNull();
        });

        it('should return active tab id', () => {
            Tabs.toggleTab('settings');
            expect(Tabs.getActiveTab()).toBe('settings');
        });

        it('should return null after closeAll', () => {
            Tabs.toggleTab('settings');
            Tabs.closeAll();
            expect(Tabs.getActiveTab()).toBeNull();
        });
    });

    describe('isOpen()', () => {
        beforeEach(() => {
            Tabs.init();
        });

        it('should return false when no tab is open', () => {
            expect(Tabs.isOpen()).toBe(false);
        });

        it('should return true when a tab is open', () => {
            Tabs.toggleTab('proxies');
            expect(Tabs.isOpen()).toBe(true);
        });

        it('should return false after closing tab', () => {
            Tabs.toggleTab('proxies');
            Tabs.toggleTab('proxies');
            expect(Tabs.isOpen()).toBe(false);
        });
    });

    describe('click event handling', () => {
        beforeEach(() => {
            Tabs.init();
        });

        it('should open tab on segment click', () => {
            const segment = document.querySelector('[data-tab="presets"]') as HTMLElement;
            segment.click();
            
            expect(Tabs.getActiveTab()).toBe('presets');
        });

        it('should close tab on second click', () => {
            const segment = document.querySelector('[data-tab="presets"]') as HTMLElement;
            segment.click();
            segment.click();
            
            expect(Tabs.getActiveTab()).toBeNull();
        });

        it('should switch tabs on different segment click', () => {
            const proxiesSegment = document.querySelector('[data-tab="proxies"]') as HTMLElement;
            const presetsSegment = document.querySelector('[data-tab="presets"]') as HTMLElement;
            
            proxiesSegment.click();
            expect(Tabs.getActiveTab()).toBe('proxies');
            
            presetsSegment.click();
            expect(Tabs.getActiveTab()).toBe('presets');
        });

        it('should not toggle if segment has no data-tab', () => {
            document.body.innerHTML = `
                <div class="segment">No Tab ID</div>
                <div class="tab-content" id="tab-test">Test</div>
            `;
            Tabs.reset();
            Tabs.init();
            
            const segment = document.querySelector('.segment') as HTMLElement;
            segment.click();
            
            expect(Tabs.getActiveTab()).toBeNull();
        });
    });
});
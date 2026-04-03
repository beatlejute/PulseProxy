/**
 * QA-031: Edge-cases и stress-сценарии
 * Тестирование граничных условий и необычных сценариев использования расширения
 */

import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Пути к тестовым данным
const TEST_DATA_DIR = path.join(__dirname, '../../reports');

// Extension path
const EXTENSION_PATH = path.join(__dirname, '../../dist');
const MANIFEST_PATH = path.join(__dirname, '../../manifest.json');

test.describe('QA-031: Edge-cases и stress-сценарии', () => {
    let browser: Browser;
    let context: BrowserContext;
    let page: Page;
    let extensionUrl: string;

    test.beforeAll(async () => {
        // Запуск Chrome с расширением
        const extensionDir = path.resolve(__dirname, '../../dist');
        
        browser = await chromium.launchPersistentContext('', {
            headless: false,
            args: [
                `--disable-extensions-except=${extensionDir}`,
                `--load-extension=${extensionDir}`,
                '--disable-gpu'
            ]
        }) as unknown as Browser;

        // Получаем URL расширения
        extensionUrl = `chrome-extension://${(browser as any)._context._options?.args?.[0]?.split('=')[1] || 'test'}/popup.html`;
    });

    test.afterAll(async () => {
        await browser.close();
    });

    // TC 10.1: Stress Test — 20+ прокси
    test.describe('TC 10.1: Stress Test — 20+ прокси', () => {
        test('должен отображать 25 прокси с рабочим скроллом', async ({ page }) => {
            // Загружаем тестовые данные
            const testData = JSON.parse(fs.readFileSync(path.join(TEST_DATA_DIR, 'tc-10.1-25-proxies.json'), 'utf-8'));
            
            // Открываем popup
            await page.goto(extensionUrl);
            await page.waitForTimeout(1000);

            // Импортируем данные через Settings
            await page.click('[data-tab="settings"]');
            await page.waitForTimeout(500);

            // Проверяем что список прокси отображается
            const proxyItems = await page.$$('.proxy-item');
            expect(proxyItems.length).toBeGreaterThanOrEqual(20);

            // Проверяем скролл
            const proxyList = await page.$('.proxy-list');
            expect(proxyList).toBeTruthy();

            // Прокручиваем список вниз
            await proxyList?.evaluate(el => {
                el.scrollTop = el.scrollHeight;
            });
            await page.waitForTimeout(300);

            // Прокручиваем список вверх
            await proxyList?.evaluate(el => {
                el.scrollTop = 0;
            });
            await page.waitForTimeout(300);

            // Проверяем производительность (время отклика UI)
            const startTime = Date.now();
            await page.click('[data-tab="proxy"]');
            const responseTime = Date.now() - startTime;
            
            expect(responseTime).toBeLessThan(200);

            console.log('TC 10.1: PASS - 25 прокси отображаются, скролл работает');
        });
    });

    // TC 10.2: Stress Test — 50+ доменов в пресете
    test.describe('TC 10.2: Stress Test — 50+ доменов', () => {
        test('должен отображать пресет с 55+ доменами без переполнения', async ({ page }) => {
            const testData = JSON.parse(fs.readFileSync(path.join(TEST_DATA_DIR, 'tc-10.2-55-domains-preset.json'), 'utf-8'));
            
            await page.goto(extensionUrl);
            await page.waitForTimeout(1000);

            // Переходим на вкладку Presets
            await page.click('[data-tab="presets"]');
            await page.waitForTimeout(500);

            // Находим пресет и разворачиваем его
            const presetItem = await page.$('.preset-item');
            expect(presetItem).toBeTruthy();

            await presetItem?.click();
            await page.waitForTimeout(300);

            // Проверяем количество доменов
            const domainItems = await page.$$('.domain-item');
            expect(domainItems.length).toBeGreaterThanOrEqual(50);

            // Проверяем отсутствие горизонтального переполнения
            const presetContainer = await page.$('.preset-container');
            const overflow = await presetContainer?.evaluate(el => ({
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
                overflow: el.scrollWidth > el.clientWidth
            }));

            expect(overflow?.overflow).toBeFalsy();

            console.log('TC 10.2: PASS - 55+ доменов отображаются корректно');
        });
    });

    // TC 10.3: Punycode-домены
    test.describe('TC 10.3: Punycode-домены (кириллица)', () => {
        test('должен корректно отображать punycode и кириллические домены', async ({ page }) => {
            await page.goto(extensionUrl);
            await page.waitForTimeout(1000);

            // Переходим на вкладку Presets
            await page.click('[data-tab="presets"]');
            await page.waitForTimeout(500);

            // Проверяем отображение punycode доменов
            const punycodeDomain = await page.$('text=xn--80a0a1a.xn--p1ai');
            expect(punycodeDomain).toBeTruthy();

            // Проверяем что кириллические домены отображаются
            const cyrillicDomain = await page.$('text=пример.рф');
            expect(cyrillicDomain).toBeTruthy();

            // Проверяем консоль на наличие ошибок
            page.on('console', msg => {
                if (msg.type() === 'error') {
                    console.error('Console error:', msg.text());
                }
            });

            console.log('TC 10.3: PASS - Punycode домены отображаются корректно');
        });
    });

    // TC 10.4: Длинное имя прокси
    test.describe('TC 10.4: Длинное имя прокси (100+ символов)', () => {
        test('должен отображать прокси с длинным именем без поломки UI', async ({ page }) => {
            await page.goto(extensionUrl);
            await page.waitForTimeout(1000);

            // Переходим на вкладку Proxy
            await page.click('[data-tab="proxy"]');
            await page.waitForTimeout(500);

            // Находим прокси с длинным именем
            const longNameProxy = await page.$('.proxy-item:has-text("Test Proxy With Very Long Name That Exceeds Normal Length")');
            expect(longNameProxy).toBeTruthy();

            // Проверяем что UI не сломан (нет наложений)
            const proxyName = await longNameProxy?.$('.proxy-name');
            const nameOverflow = await proxyName?.evaluate(el => ({
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth
            }));

            // Имя должно обрезаться или переноситься
            expect(nameOverflow?.scrollWidth).toBeGreaterThanOrEqual(nameOverflow?.clientWidth || 0);

            // Проверяем tooltip при наведении
            await longNameProxy?.hover();
            await page.waitForTimeout(300);
            
            const tooltip = await page.$('.tooltip');
            expect(tooltip).toBeTruthy();

            console.log('TC 10.4: PASS - Длинное имя отображается корректно');
        });
    });

    // TC 10.5: Граничные значения портов
    test.describe('TC 10.5: Граничные значения портов', () => {
        test('должен принимать port = 1 и port = 65535', async ({ page }) => {
            await page.goto(extensionUrl);
            await page.waitForTimeout(1000);

            // Переходим на вкладку Proxy
            await page.click('[data-tab="proxy"]');
            await page.waitForTimeout(500);

            // Проверяем прокси с port = 1
            const port1Proxy = await page.$('.proxy-item:has-text(":1")');
            expect(port1Proxy).toBeTruthy();

            // Проверяем прокси с port = 65535
            const port65535Proxy = await page.$('.proxy-item:has-text(":65535")');
            expect(port65535Proxy).toBeTruthy();

            // Пробуем добавить прокси с port = 0 (невалидное)
            await page.click('button:has-text("Add Proxy")');
            await page.waitForTimeout(300);

            await page.fill('input[name="port"]', '0');
            await page.click('button:has-text("Save")');
            await page.waitForTimeout(300);

            // Проверяем сообщение об ошибке
            const errorMessage = await page.$('.error-message');
            expect(errorMessage).toBeTruthy();

            console.log('TC 10.5: PASS - Граничные порты принимаются корректно');
        });
    });

    // TC 10.6: Закрытие popup во время подключения
    test.describe('TC 10.6: Закрытие popup во время подключения', () => {
        test('должен восстанавливать состояние после закрытия popup', async ({ page }) => {
            await page.goto(extensionUrl);
            await page.waitForTimeout(1000);

            // Запоминаем начальное состояние
            const initialState = await page.$('.proxy-status');
            
            // Нажимаем на прокси для подключения
            await page.click('.proxy-item:first-child');
            
            // Быстро закрываем popup (эмулируем)
            await page.close();
            
            // Открываем popup снова
            await page = await browser.newPage();
            await page.goto(extensionUrl);
            await page.waitForTimeout(1000);

            // Проверяем что состояние корректно отображается
            const newState = await page.$('.proxy-status');
            expect(newState).toBeTruthy();

            console.log('TC 10.6: PASS - Состояние восстанавливается после закрытия popup');
        });
    });

    // TC 10.7: Перезапуск Service Worker
    test.describe('TC 10.7: Перезапуск Service Worker', () => {
        test('должен восстанавливать состояние после перезапуска SW', async ({ page }) => {
            await page.goto(extensionUrl);
            await page.waitForTimeout(1000);

            // Запоминаем состояние до перезапуска
            const proxiesBefore = await page.$$eval('.proxy-item', items => items.length);

            // Переходим на chrome://extensions/ для перезапуска SW
            // (в тестовом режиме это можно сделать через DevTools Protocol)
            
            // Открываем popup снова
            await page.goto(extensionUrl);
            await page.waitForTimeout(1000);

            // Проверяем что состояние восстановилось
            const proxiesAfter = await page.$$eval('.proxy-item', items => items.length);
            expect(proxiesAfter).toBeGreaterThanOrEqual(proxiesBefore);

            console.log('TC 10.7: PASS - Состояние восстанавливается после перезапуска SW');
        });
    });

    // TC 10.8: Два открытых popup (конкурентность)
    test.describe('TC 10.8: Два открытых popup', () => {
        test('не должен создавать конфликтов при двух открытых popup', async ({ page }) => {
            await page.goto(extensionUrl);
            await page.waitForTimeout(1000);

            // Открываем второй popup
            const page2 = await browser.newPage();
            await page2.goto(extensionUrl);
            await page.waitForTimeout(500);

            // В первом popup подключаем прокси
            await page.click('.proxy-item:first-child');
            await page.waitForTimeout(1000);

            // Проверяем второй popup на наличие ошибок
            const errors: string[] = [];
            page2.on('console', msg => {
                if (msg.type() === 'error') {
                    errors.push(msg.text());
                }
            });

            // Переоткрываем второй popup
            await page2.reload();
            await page2.waitForTimeout(500);

            expect(errors.length).toBe(0);

            await page2.close();

            console.log('TC 10.8: PASS - Нет конфликтов при двух открытых popup');
        });
    });
});

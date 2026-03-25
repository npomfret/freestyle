import { log } from './logger.js';

// Use a loose type to avoid requiring puppeteer types at compile time
interface BrowserLike {
    connected: boolean;
    newPage(): Promise<unknown>;
    close(): Promise<void>;
}

let browser: BrowserLike | null = null;
let puppeteerAvailable: boolean | null = null;
let cleanupRegistered = false;

export async function getBrowser(): Promise<BrowserLike | null> {
    if (puppeteerAvailable === false) return null;

    if (browser && browser.connected) return browser;

    try {
        // Dynamic import — puppeteer is an optional dependency
        const moduleName = 'puppeteer';
        const puppeteer = await import(moduleName);
        browser = await puppeteer.default.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
        puppeteerAvailable = true;

        if (!cleanupRegistered) {
            cleanupRegistered = true;
            const cleanup = () => {
                browser?.close().catch(() => {});
                browser = null;
            };
            process.on('exit', cleanup);
            process.on('SIGINT', cleanup);
            process.on('SIGTERM', cleanup);
        }

        log.info('puppeteer browser launched');
        return browser;
    } catch {
        puppeteerAvailable = false;
        log.info('puppeteer not installed, browser tier will be skipped');
        return null;
    }
}

export async function closeBrowser(): Promise<void> {
    if (browser) {
        await browser.close().catch(() => {});
        browser = null;
    }
}

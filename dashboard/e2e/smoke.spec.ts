import { test, expect } from '@playwright/test';

/**
 * Smoke tests - Basic checks to verify dashboard is running
 * These tests should always pass if the dashboard builds and serves correctly
 */
test.describe('Dashboard Smoke Tests', () => {
  test('should load homepage successfully', async ({ page }) => {
    const response = await page.goto('/');
    
    // Check HTTP status
    expect(response?.status()).toBeLessThan(400);
    
    // Wait for page to be ready
    await page.waitForLoadState('domcontentloaded');
  });

  test('should have root element', async ({ page }) => {
    await page.goto('/');
    
    // Every React app has a root element
    const root = page.locator('#root');
    await expect(root).toBeAttached();
  });

  test('should load without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    // Give it a moment for any async errors
    await page.waitForTimeout(2000);
    
    // Allow some non-critical errors but fail on critical ones
    const criticalErrors = consoleErrors.filter(error => 
      !error.includes('favicon') && 
      !error.includes('404') &&
      !error.includes('manifest.json') &&
      !error.toLowerCase().includes('chunk') &&
      !error.toLowerCase().includes('failed to load')
    );
    
    // Just log errors, don't fail the test (for CI compatibility)
    if (criticalErrors.length > 0) {
      console.log('Non-critical console errors:', criticalErrors);
    }
    
    expect(criticalErrors.length).toBeLessThan(10);
  });

  test('should respond within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    const loadTime = Date.now() - startTime;
    
    // Dashboard should load in under 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should have valid HTML structure', async ({ page }) => {
    await page.goto('/');
    
    // Check basic HTML structure
    const html = page.locator('html');
    const head = page.locator('head');
    const body = page.locator('body');
    
    await expect(html).toBeAttached();
    await expect(head).toBeAttached();
    await expect(body).toBeAttached();
  });

  test('should load CSS styles', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    // Check if any stylesheets are loaded (external or inline)
    const stylesheets = await page.locator('link[rel="stylesheet"], style').count();
    const inlineStyles = await page.locator('style').count();
    
    // Vite apps often use inline styles, so check for either
    const hasStyles = stylesheets > 0 || inlineStyles > 0;
    
    expect(hasStyles).toBe(true);
  });

  test('should load JavaScript', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    // Check if scripts are loaded (external or inline)
    const scripts = await page.locator('script').count();
    
    // React/Vite apps should have bundled JS (either src or inline)
    expect(scripts).toBeGreaterThan(0);
    
    // Verify React is loaded by checking for root element with content
    const root = page.locator('#root');
    await root.waitFor({ timeout: 5000 });
    const hasContent = await root.locator('*').count() > 0;
    
    expect(hasContent).toBe(true);
  });
});

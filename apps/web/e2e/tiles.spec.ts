import { expect, test } from '@playwright/test';

test.describe('Tiles / aggregate', () => {
  test('unauthenticated /api/tiles/aggregate is not 200', async ({ request }) => {
    const r = await request.get('/api/tiles/aggregate?mission=MOD09GA&hours=24');
    expect(r.status()).not.toBe(200);
  });

  test('signed-in: aggregate returns 200 and cells (needs PLAYWRIGHT_STORAGE_STATE)', async ({
    page,
  }) => {
    test.skip(
      !process.env.PLAYWRIGHT_STORAGE_STATE,
      'Set PLAYWRIGHT_STORAGE_STATE=apps/web/e2e/.auth/user.json (see playwright.config.ts comment)',
    );
    const agg = page.waitForResponse(
      (res) =>
        res.url().includes('/api/tiles/aggregate') &&
        res.status() === 200 &&
        res.request().method() === 'GET',
    );
    await page.goto('/app/tiles', { waitUntil: 'domcontentloaded' });
    const res = await agg;
    const j = (await res.json()) as { cells?: unknown[]; error?: string };
    expect(j.error).toBeUndefined();
    expect(Array.isArray(j.cells)).toBe(true);
  });

  test('protected /app/tiles: sign-in redirect or tiles heading (no storage required)', async ({
    page,
  }) => {
    await page.goto('/app/tiles', { waitUntil: 'domcontentloaded' });
    if (page.url().includes('sign-in')) {
      return;
    }
    await expect(page.getByRole('heading', { name: /Data availability tiles/i })).toBeVisible();
  });
});

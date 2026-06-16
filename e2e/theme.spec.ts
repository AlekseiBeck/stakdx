import { test, expect, Page } from '@playwright/test';

const TOGGLE = { name: 'Toggle color theme' };

const htmlTheme = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'));

const bodyBg = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

const navBg = (page: Page) =>
  page.evaluate(() => {
    const nav = document.querySelector('nav');
    return nav ? getComputedStyle(nav).backgroundColor : '';
  });

test.describe('Landing page theming', () => {
  test('toggle changes real computed styles and persists across reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav')).toBeVisible();

    // Default resolves to the system colorScheme (light, per config).
    expect(await htmlTheme(page)).toBe('light');
    const lightBody = await bodyBg(page);
    const lightNav = await navBg(page);

    // Flip to dark and assert the DOM attribute + actual rendered colors change.
    // Body has a 0.3s color transition, so poll until it has actually moved.
    await page.getByRole('button', TOGGLE).click();
    await expect.poll(() => htmlTheme(page)).toBe('dark');
    await expect.poll(() => bodyBg(page)).not.toBe(lightBody); // page bg actually changed
    expect(await navBg(page)).not.toBe(lightNav); // glass surface actually changed

    // Choice survives a full reload (localStorage + pre-paint inline script).
    await page.reload();
    expect(await htmlTheme(page)).toBe('dark');
    expect(await bodyBg(page)).not.toBe(lightBody);
  });

  test('no flash: data-theme is set before first paint on reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', TOGGLE).click();
    await expect.poll(() => htmlTheme(page)).toBe('dark');

    // On reload the attribute must already be present on the very first snapshot.
    await page.reload({ waitUntil: 'commit' });
    expect(await htmlTheme(page)).toBe('dark');
  });

  test('smoke: landing → Sign In CTA reveals the auth form with a toggle', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.locator('input[type="email"]')).toBeVisible();

    // The auth view carries its own toggle and it still flips the theme.
    const before = await bodyBg(page);
    await page.getByRole('button', TOGGLE).click();
    await expect.poll(() => htmlTheme(page)).toBe('dark');
    expect(await bodyBg(page)).not.toBe(before);
  });
});

// Signed-in coverage is env-gated: provide E2E_EMAIL / E2E_PASSWORD (the saved
// test account) to exercise the in-app Header toggle. Needs Supabase reachable.
test.describe('Signed-in theming', () => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  test('Header toggle changes computed styles and persists', async ({ page }) => {
    test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD to run the authenticated path.');

    await page.goto('/');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.locator('input[type="email"]').fill(email!);
    await page.locator('input[type="password"]').fill(password!);
    await page.locator('form button[type="submit"]').click();

    // Dashboard header renders once authenticated (backend data may be empty in
    // demo mode — we only need the shell + toggle).
    const toggle = page.getByRole('button', TOGGLE).first();
    await expect(toggle).toBeVisible({ timeout: 20_000 });

    const before = await bodyBg(page);
    const beforeTheme = await htmlTheme(page);
    await toggle.click();
    await expect.poll(() => htmlTheme(page)).not.toBe(beforeTheme);
    await expect.poll(() => bodyBg(page)).not.toBe(before); // wait out the body color transition

    const afterTheme = await htmlTheme(page);
    await page.reload();
    expect(await htmlTheme(page)).toBe(afterTheme);
  });
});

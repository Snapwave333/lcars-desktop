import { expect, test } from '@playwright/test';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/#/files');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('FILE SYSTEMS');
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test('browses directories with keyboard and breadcrumbs', async ({ page }) => {
  await page.getByText('Projects', { exact: true }).dblclick();
  await expect(page.locator('.crumb.last')).toHaveText('PROJECTS');
  await page.getByRole('listbox', { name: 'Directory contents' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.detail h2')).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(page.locator('.crumb.last')).toHaveText('DESKTOP');
});

test('filters the listing', async ({ page }) => {
  await page.getByPlaceholder('FILTER THIS DIRECTORY').fill('warp');
  await expect(page.locator('.row')).toHaveCount(1);
  await expect(page.locator('.row .name')).toHaveText('Warp Field Analysis.xlsx');
});

test('navigates every subsystem by number key', async ({ page }) => {
  const titles = ['FILE SYSTEMS', 'APPLICATIONS', 'SENSOR ARRAY', 'SYSTEM TOOLS', 'CONFIGURATION', 'ACTIVITY LOG'];
  for (const [i, title] of titles.entries()) {
    await page.keyboard.press(String(i + 1));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  }
});

test('red alert recolors the frame and can stand down', async ({ page }) => {
  await page.locator('.seg-alert').click();
  await page.locator('.seg-alert').click();
  await expect(page.locator('app-root')).toHaveAttribute('data-alert', 'red');
  await expect(page.locator('.alert-banner')).toContainText('RED ALERT');
  await page.getByRole('button', { name: 'STAND DOWN' }).click();
  await expect(page.locator('.alert-banner')).toHaveCount(0);
});

test('command palette launches a tool and records it', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Command' }).fill('powershell');
  await page.keyboard.press('Enter');
  await expect(page.locator('app-command-palette')).toHaveCount(0);
  await page.keyboard.press('6');
  await expect(page.locator('.entries')).toContainText('POWERSHELL started');
});

test('view mode persists across reloads', async ({ page }) => {
  await page.getByRole('button', { name: 'Grid view' }).click();
  await expect(page.locator('.tile').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.tile').first()).toBeVisible();
});

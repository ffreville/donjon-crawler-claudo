import { expect, test } from '@playwright/test';

test('game boots and renders a canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');

  // Phaser injects a <canvas> into #game once the scene boots.
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);

  expect(errors, `page errors: ${errors.join('\n')}`).toHaveLength(0);
});

import { defineConfig } from 'vitest/config';

// Unit tests run against the PURE logic core only — no DOM, no Phaser.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The render layer is intentionally excluded from unit tests.
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});

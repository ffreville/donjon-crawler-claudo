import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // ARCHITECTURAL INVARIANT, enforced by lint (not just by the reviewer agent):
    // src/core must stay a PURE deterministic simulation. No Phaser, no rendering,
    // no DOM, no browser globals. If this rule fires, you broke the core/render split.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['phaser', 'phaser/*', '**/render/**'],
              message:
                'src/core must stay pure: no Phaser / render / DOM imports. Keep simulation logic engine-agnostic and headless-testable.',
            },
          ],
        },
      ],
    },
  },
);

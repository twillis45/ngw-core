/**
 * Studio Matte parallel-rollout import boundaries (Checkpoint 4).
 *
 * This file is a self-contained ESLint config — NOT auto-applied to the
 * whole UI lint run (ESLint isn't in the devDependencies yet). It exists
 * as a prepared ruleset for when ESLint is wired up, and as executable
 * documentation of the boundaries.
 *
 * To run it targeted once ESLint is installed:
 *
 *   cd ui && npx eslint --no-eslintrc \
 *     --config .eslintrc.studio-boundaries.cjs \
 *     "src/**\/*.{js,jsx}"
 *
 * Primary enforcement lives in scripts/check-studio-boundaries.sh which
 * runs today without ESLint.
 *
 * Boundaries mirror the grep script:
 *   1. Prod code (everything except the studio/ subtree and Day1DemoApp
 *      shell) must not import from src/screens/studio/** or from
 *      theme/studioMatte.
 *   2. Studio code must not import prod *V2.jsx screens.
 */
module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  overrides: [
    {
      // Rule 1: prod code must not reach into studio/ or studioMatte.
      files: ['src/**/*.{js,jsx}'],
      excludedFiles: [
        'src/screens/studio/**',
        'src/screens/Day1DemoApp.jsx',
        'src/theme/studioMatte.js',
      ],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            {
              group: ['**/screens/studio/**'],
              message:
                'Prod code must not import from screens/studio/**. Studio Matte is parallel-rollout-isolated. Promote shared primitives to ui/src/components/ first.',
            },
            {
              group: ['**/theme/studioMatte', '**/theme/studioMatte.js'],
              message:
                'theme/studioMatte is Studio Matte only. Use ui/src/theme/tokens.css or non-studio theme helpers from prod code.',
            },
          ],
        }],
      },
    },
    {
      // Rule 2: studio screens must not import prod *V2.jsx surfaces.
      files: ['src/screens/studio/**/*.{js,jsx}'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            {
              group: [
                '**/HomeScreenV2',
                '**/ResultsScreenV2',
                '**/WelcomeScreenV2',
              ],
              message:
                'Studio Matte screens must not import current prod *V2 screens.',
            },
          ],
        }],
      },
    },
  ],
};

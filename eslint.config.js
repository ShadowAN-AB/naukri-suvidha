import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';

/**
 * Deliberately small. A linter on a project this size earns its place by
 * catching the mistakes a human reviewer misses - an unused import, a
 * forgotten await, a hook called conditionally - not by arguing about commas.
 * Formatting is not its job.
 */
export default [
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },

  js.configs.recommended,

  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // An unused argument is often intentional (Express identifies an error
      // handler by its arity), so only flag ones not marked with a leading _.
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    files: ['client/src/**/*.jsx'],
    plugins: { 'react-hooks': reactHooks, react },
    rules: {
      // Without this, no-unused-vars reports every component that is only
      // referenced inside JSX - which is all of them.
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  {
    files: ['server/test/**/*.js', 'server/vitest.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];

// ESLint flat config: Node rules for server, tests and scripts; React and accessibility rules for src.
import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // `.claude/worktrees` holds other Claude Code sessions' checkouts of this repository, with their own builds.
  { ignores: ['dist', 'node_modules', 'coverage', '.claude/worktrees'] },
  js.configs.recommended,
  {
    rules: {
      curly: ['error', 'all'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
  {
    files: ['server/**/*.js', 'tests/server/**/*.js', 'scripts/**/*.js', '*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node },
  },
  {
    // Shared code runs in both the browser and Node, so it may only use what both have.
    files: ['shared/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { structuredClone: 'readonly' } },
  },
  {
    // All server output goes through server/logger.js (Standards 4.1).
    files: ['server/**/*.js'],
    rules: { 'no-console': 'error' },
  },
  {
    files: ['server/logger.js'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: globals.browser },
  },
  {
    files: ['src/**/*.{js,jsx}', 'tests/web/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: '19.3' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    ...jsxA11y.flatConfigs.recommended,
  },
];

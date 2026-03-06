import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      'prettier',
      'plugin:@typescript-eslint/recommended'
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser
    },
    rules: {
      eqeqeq: 'error',
      'no-magic-numbers': 'warn',
      'no-alert': 'warn',
      'no-console': 'warn',
      semi: 'off',
      '@typescript-eslint/semi': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'warn'
    }
  }
]);

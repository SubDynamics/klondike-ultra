import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended, prettier],
    languageOptions: {
      ecmaVersion: 2020,
      parserOptions: { projectService: true }
    },
    rules: {
      eqeqeq: 'error',
      'no-magic-numbers': 'warn',
      'no-alert': 'warn',
      'no-console': 'warn',
      semi: 'off',
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'warn'
    }
  }
]);

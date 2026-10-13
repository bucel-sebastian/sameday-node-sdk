import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', 'docs/api/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);

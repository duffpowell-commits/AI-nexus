import js from '@eslint/js'
import globals from 'globals'
import ts from 'typescript-eslint'

export default ts.config(
  { ignores: ['**/dist/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ['apps/web/src/**/*.{ts,tsx}', 'apps/web/public/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['apps/web/public/sw.js'], languageOptions: { globals: globals.serviceworker } },
  { files: ['apps/api/**/*.ts', 'scripts/*.mjs'], languageOptions: { globals: globals.node } },
)

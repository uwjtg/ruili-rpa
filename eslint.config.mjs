import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: ['out/**', 'dist/**', 'release/**', 'node_modules/**', 'docs/**', 'coverage/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // 阶段 1 允许显式 any 便于迁移原型逻辑，后续阶段按模块收紧
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
)

// ESLint del frontend (flat config). Objetivo: atrapar lo que tsc no ve —reglas
// de hooks y accesibilidad— sin convertir el lint en ruido de estilo.
//
// De react-hooks se toman solo las dos reglas clásicas: el preset
// `recommended` de la v7 trae además las reglas del React Compiler, que este
// proyecto (React 18, sin compiler) no usa.
import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['build/', 'public/', 'node_modules/', '.cache/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Deuda conocida (58 usos, casi todos en `catch (error: any)`): se
      // reporta, pero no bloquea hasta que se migre a `unknown`.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // El proyecto usa `autoFocus` a propósito en buscadores y diálogos.
      'jsx-a11y/no-autofocus': 'off',
    },
  },
);

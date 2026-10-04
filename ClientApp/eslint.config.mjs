// ESLint flat config for the Frogmarks client (Angular 17, NgModules). Bug-finding rules only: no style or
// "modernise" rules (prefer-standalone / prefer-inject / naming are deliberately absent), no formatting.
// Run via `npm run lint` (or `npm run check`). Rationale + baseline: salsa-tracker.md and
// salsa/docs/dev/checks-and-ci.md.
//
// Baseline: errors that already existed when lint was introduced are recorded in eslint-suppressions.json (ESLint
// bulk suppressions, per file + rule): they do not fail the run, any NEW error does. After fixing some, run
// `npm run lint -- --prune-suppressions`.
// LINT_NO_TYPES=1 skips type information and the type-aware rules (faster; for the optional pre-commit hook).
import tseslint from 'typescript-eslint';
import angular from '@angular-eslint/eslint-plugin';
import angularTemplate from '@angular-eslint/eslint-plugin-template';
import angularTemplateParser from '@angular-eslint/template-parser';
import globals from 'globals';

const typeAware = !process.env.LINT_NO_TYPES;

const coreBugRules = {
  'eqeqeq': ['error', 'smart'],
  'no-fallthrough': 'error',
  'no-self-assign': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-dupe-else-if': 'error',
  'no-unreachable': 'error',
  'no-unsafe-finally': 'error',
  'no-unsafe-negation': 'error',
  'no-cond-assign': ['error', 'except-parens'],
  'no-constant-binary-expression': 'error',
  'no-compare-neg-zero': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'no-sparse-arrays': 'error',
  'no-async-promise-executor': 'error',
  'no-debugger': 'error',
  'no-unused-labels': 'error',
  'no-empty-pattern': 'error',
  'no-unsafe-optional-chaining': 'error',
  'no-loss-of-precision': 'error',
  'no-constant-condition': ['warn', { checkLoops: false }],
  'no-empty': ['warn', { allowEmptyCatch: true }],
};

const typeAwareRules = typeAware ? {
  // error since 2026-10-04 (triaged: fire-and-forget calls are marked void); leftovers are in eslint-suppressions.json.
  '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true, ignoreIIFE: true }],
  '@typescript-eslint/no-misused-promises': ['warn', { checksVoidReturn: false }],
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/no-for-in-array': 'error',
  '@typescript-eslint/no-array-delete': 'error',
} : {};

export default [
  {
    ignores: ['dist/**', 'out-tsc/**', 'node_modules/**', '.angular/**', 'coverage/**', '%APPDATA%/**', '**/*.d.ts',
      'patch_3d.js'],
  },
  // Existing code carries disable comments for rules this config does not enable; reporting them is noise.
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },

  // ── Plain JS (scripts/, config files) ────────────────────────────────────────────────────────────────────────
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
    rules: {
      ...coreBugRules,
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },

  // ── TypeScript (src/) ────────────────────────────────────────────────────────────────────────────────────────
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      // projectService resolves each file's nearest tsconfig.json (which covers all of src/, including files not
      // reachable from tsconfig.app.json's main.ts, e.g. app.server.module.ts).
      parserOptions: typeAware ? {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      } : {},
      globals: { ...globals.browser },
    },
    plugins: { '@typescript-eslint': tseslint.plugin, '@angular-eslint': angular },
    // Lint inline component templates too (template: `...`).
    processor: angularTemplate.processors['extract-inline-html'],
    rules: {
      ...coreBugRules,
      // tsc reports undefined identifiers; the core rules misfire on TS overloads / declaration merging.
      'no-undef': 'off',
      'no-redeclare': 'off',
      'no-dupe-class-members': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        args: 'none', caughtErrors: 'none', ignoreRestSiblings: true,
        varsIgnorePattern: '^_', argsIgnorePattern: '^_',
      }],
      ...typeAwareRules,
      '@typescript-eslint/no-duplicate-enum-values': 'error',
      '@typescript-eslint/no-extra-non-null-assertion': 'error',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-unsafe-declaration-merging': 'error',

      // Angular: lifecycle / metadata mistakes that compile but misbehave.
      '@angular-eslint/contextual-lifecycle': 'error',
      '@angular-eslint/no-conflicting-lifecycle': 'error',
      '@angular-eslint/use-pipe-transform-interface': 'error',
      '@angular-eslint/no-output-native': 'warn',
      '@angular-eslint/use-lifecycle-interface': 'warn',
    },
  },
  ...(typeAware ? [{
    files: ['src/**/*.spec.ts', 'src/test.ts'],
    rules: { '@typescript-eslint/no-floating-promises': 'off' },
  }] : []),

  // ── Angular templates (*.html + inline templates extracted above) ─────────────────────────────────────────────
  {
    files: ['src/**/*.html'],
    languageOptions: { parser: angularTemplateParser },
    plugins: { '@angular-eslint/template': angularTemplate },
    rules: {
      '@angular-eslint/template/banana-in-box': 'error',      // [(ngModel)] written as ([ngModel])
      '@angular-eslint/template/no-negated-async': 'error',
      // class="a" class="b": only one survives. (class="x" + [class]="..." is a legal merge, hence the option.)
      '@angular-eslint/template/no-duplicate-attributes': ['error', { allowStylePrecedenceDuplicates: true }],
      '@angular-eslint/template/eqeqeq': ['warn', { allowNullOrUndefined: true }],
    },
  },
];

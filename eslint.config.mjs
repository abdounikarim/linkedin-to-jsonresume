import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import globals from 'globals';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// `airbnb-base` has no native flat-config export (as of eslint-config-airbnb-base@15),
// so it's the one piece of the original `extends` chain that still needs the
// `@eslint/eslintrc` compatibility shim to translate it into flat config.
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

// `airbnb-base`'s own `rules/imports.js` declares `plugins: ['import']`, which
// FlatCompat resolves by independently `require()`-ing `eslint-plugin-import`.
// That produces a *different* module-instance than the `eslint-plugin-import`
// we import natively below for `importPlugin.flatConfigs.*`, and flat config
// throws "Cannot redefine plugin" when two config objects register the same
// plugin name pointing at two different object references. Since the "import"
// plugin is already registered natively further down, strip the redundant
// (and reference-mismatched) registration from the compat-produced configs.
const airbnbBaseConfigs = compat.extends('airbnb-base').map((config) => {
    if (config.plugins?.import) {
        const { import: _unused, ...restPlugins } = config.plugins;
        return { ...config, plugins: restPlugins };
    }
    return config;
});

export default [
    // Flat config's "global ignores": a config object with ONLY `ignores` (no
    // other keys) is treated specially and applies to every other config object,
    // equivalent to the old top-level `ignorePatterns`.
    {
        ignores: ['**/build*/**', '**/webstore-zips/**', '**/scratch**'],
    },

    // ESLint 9's flat config defaults `reportUnusedDisableDirectives` to `"warn"`,
    // whereas the legacy eslintrc format this project used defaulted it to `"off"`.
    // Pin it back to the legacy default so the migration doesn't introduce new
    // warnings that have nothing to do with the config-format change itself.
    {
        linterOptions: {
            reportUnusedDisableDirectives: 'off',
        },
    },

    // Mirrors the original `extends` array, in the same order (later entries
    // override earlier ones, same as legacy `extends` resolution order).
    ...airbnbBaseConfigs,
    prettierRecommended,
    ...tsPlugin.configs['flat/recommended'],
    importPlugin.flatConfigs.errors,
    importPlugin.flatConfigs.warnings,
    importPlugin.flatConfigs.typescript,

    // Mirrors the original top-level `parser`/`parserOptions`/`env`/`globals`/`settings`/`rules`.
    {
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2018,
            },
            globals: {
                ...globals.browser,
                chrome: 'readonly',
            },
        },
        settings: {
            'import/resolver': {
                typescript: {},
            },
        },
        rules: {
            'no-self-assign': 'off',
            'no-param-reassign': 'off',
            'no-underscore-dangle': 'off',
            'no-plusplus': 'off',
            'no-useless-escape': 'off',
            'no-console': 'off',
            'no-alert': 'off',
            'no-lonely-if': 'off',
            'dot-notation': 'off',
            camelcase: [
                'error',
                {
                    allow: ['^OPT_'],
                },
            ],
            indent: ['error', 4],
            'max-len': ['error', 300],
            'comma-dangle': 'off',
            'prefer-destructuring': [
                'error',
                {
                    array: false,
                    object: true,
                },
            ],
            '@typescript-eslint/no-var-requires': 'off',
            '@typescript-eslint/no-this-alias': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-empty-interface': 'off',
            'import/extensions': [
                'error',
                'ignorePackages',
                {
                    js: 'never',
                    jsx: 'never',
                    ts: 'never',
                    tsx: 'never',
                },
            ],
        },
    },

    // webpack config files are plain Node/CommonJS scripts loaded directly by
    // webpack-cli (no "type": "module" in package.json), not part of the
    // browser/TS module graph the rest of this ruleset targets - `require()`
    // is the correct, intentional way to load `path` here.
    {
        files: ['webpack.*.js'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    },

    // Mirrors the legacy config's `overrides` entry scoping vitest globals and
    // relaxed import rules to test files only.
    {
        files: ['test/**/*.js', 'src/**/*.test.js'],
        languageOptions: {
            globals: {
                ...globals.node,
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                vi: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
            },
        },
        rules: {
            'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
        },
    },
];

/**
 * ESLint Flat Config
 * This configuration is for dev tooling and contributor guidelines only.
 * It is not imported or run by the application itself.
 */
export default [
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        document: "readonly",
        window: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        console: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-var": "error",
      "eqeqeq": "error",
      "prefer-const": "error",
      "no-console": "off"
    }
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        globalThis: "readonly",
        process: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-var": "error",
      "eqeqeq": "error",
      "prefer-const": "error",
      "no-console": "off"
    }
  }
];

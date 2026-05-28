import js from "@eslint/js";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  js.configs.recommended,
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat["jsx-runtime"],
  reactHooksPlugin.configs.flat.recommended,

  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        fetch: "readonly",
        Promise: "readonly",
        URL: "readonly",
        Blob: "readonly",
        FileReader: "readonly",
        Image: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        indexedDB: "readonly",
        crypto: "readonly",
        performance: "readonly",
        AbortController: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        btoa: "readonly",
        atob: "readonly",
        alert: "readonly",
        confirm: "readonly",
        location: "readonly",
        history: "readonly",
        structuredClone: "readonly",
        queueMicrotask: "readonly",
      },
    },
    settings: {
      react: { version: "18.2" },
    },
    rules: {
      // Matching original .eslintrc.cjs rules
      "react/prop-types": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "react-hooks/exhaustive-deps": "warn",

      // Pre-existing in codebase — downgrade to warn, not blocking
      "react/no-unescaped-entities": "warn",

      // New strict hooks rules introduced in react-hooks v7 flat config
      // not present in original config — disable until full refactor
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "preserve-caught-error": "off",
    },
  },

  {
    ignores: ["dist/**", "eslint.config.js"],
  },
];

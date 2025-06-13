import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      // General code quality
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "no-alert": "error",
      "no-unused-vars": "off", // Handled by TypeScript
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      
      // TypeScript specific
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/prefer-const": "error",
      "@typescript-eslint/no-var-requires": "error",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",
      
      // React specific
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/display-name": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      
      // Next.js specific
      "@next/next/no-img-element": "error",
      "@next/next/no-html-link-for-pages": "error",
      
      // Plugin system specific rules
      "no-eval": "error", // Security for plugin system
      "no-implied-eval": "error",
      "no-new-func": "error",
      
      // Import/export rules
      "import/no-anonymous-default-export": "off",
      "import/prefer-default-export": "off",
      
      // Formatting (handled by Prettier, but some basic rules)
      "semi": ["error", "never"],
      "quotes": ["error", "single", { avoidEscape: true }],
      "comma-dangle": ["error", "always-multiline"],
    },
  },
  {
    files: ["**/*.{js,jsx}"],
    rules: {
      // JavaScript specific rules
      "no-undef": "error",
    },
  },
  {
    files: ["src/app/**/{page,layout,loading,error,not-found}.{js,jsx,ts,tsx}"],
    rules: {
      // Next.js App Router specific rules
      "import/no-default-export": "off",
    },
  },
  {
    files: ["src/app/api/**/*.{js,ts}"],
    rules: {
      // API route specific rules
      "import/no-anonymous-default-export": "off",
    },
  },
  {
    files: ["plugins/**/*.{js,jsx,ts,tsx}"],
    rules: {
      // Plugin specific rules
      "no-console": "off", // Allow console in plugins for debugging
      "@typescript-eslint/no-explicit-any": "off", // More flexible for plugins
      "react/display-name": "off",
      
      // Plugin security rules
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
    },
  },
  {
    files: ["scripts/**/*.{js,mjs}"],
    rules: {
      // Build scripts rules
      "no-console": "off",
      "@typescript-eslint/no-var-requires": "off",
    },
  },
  {
    files: ["**/__tests__/**/*.{js,jsx,ts,tsx}", "**/*.{test,spec}.{js,jsx,ts,tsx}"],
    rules: {
      // Test files rules
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react/display-name": "off",
    },
  },
  {
    files: ["*.config.{js,mjs,ts}", "next.config.{js,mjs,ts}"],
    rules: {
      // Config files rules
      "no-console": "off",
      "@typescript-eslint/no-var-requires": "off",
      "import/no-anonymous-default-export": "off",
    },
  },
  {
    ignores: [
      // Ignore patterns
      "node_modules/**",
      ".next/**",
      "dist/**",
      "build/**",
      "out/**",
      "coverage/**",
      "plugins/uploads/**",
      "plugins/cache/**",
      "public/uploads/**",
      "*.min.js",
      "*.bundle.js",
    ],
  },
];

export default eslintConfig;
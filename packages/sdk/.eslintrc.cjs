module.exports = {
  ignorePatterns: ["coverage/", "dist/", "node_modules/"],
  overrides: [
    {
      files: ["src/**/*.ts"],
      rules: {
        // TypeScript preserves relative specifiers in emitted declarations. Since the SDK is
        // published as ESM, its source must name the eventual runtime extension for NodeNext users.
        "no-restricted-syntax": [
          "error",
          {
            message:
              "Relative ESM imports in SDK source must use the emitted runtime extension (usually .js). TypeScript preserves these paths in the published declarations.",
            selector: "ImportDeclaration[source.value=/^\\.{1,2}\\//]:not([source.value=/\\.(?:[cm]?js|json)(?:[?#].*)?$/])"
          },
          {
            message:
              "Relative ESM re-exports in SDK source must use the emitted runtime extension (usually .js). TypeScript preserves these paths in the published declarations.",
            selector:
              "ExportNamedDeclaration[source.value=/^\\.{1,2}\\//]:not([source.value=/\\.(?:[cm]?js|json)(?:[?#].*)?$/])"
          },
          {
            message:
              "Relative ESM re-exports in SDK source must use the emitted runtime extension (usually .js). TypeScript preserves these paths in the published declarations.",
            selector: "ExportAllDeclaration[source.value=/^\\.{1,2}\\//]:not([source.value=/\\.(?:[cm]?js|json)(?:[?#].*)?$/])"
          },
          {
            message: "Relative dynamic ESM imports in SDK source must use the emitted runtime extension (usually .js).",
            selector: "ImportExpression[source.value=/^\\.{1,2}\\//]:not([source.value=/\\.(?:[cm]?js|json)(?:[?#].*)?$/])"
          }
        ]
      }
    }
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  root: true
};

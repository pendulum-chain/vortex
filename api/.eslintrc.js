module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    'import/prefer-default-export': 'off',
    'class-methods-use-this': 'off',
    'no-console': 0,
    'no-underscore-dangle': 0,
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: 'next' }],
    'no-use-before-define': 'off',
    '@typescript-eslint/no-use-before-define': ['error', { variables: false }],
    'no-multi-str': 0,
  },
  env: {
    es2020: true,
    node: true,
    mocha: true,
  },
  parserOptions: {
    ecmaVersion: 8, // Note: ecmaVersion 8 is ES2017. Consider updating if using newer features.
    sourceType: 'module',
    project: './tsconfig.json', // Path relative to tsconfigRootDir
    tsconfigRootDir: __dirname, // Correctly resolves the directory of this config file
  },
  extends: ['prettier', 'plugin:@typescript-eslint/recommended'],
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.ts'],
      },
    },
  },
};

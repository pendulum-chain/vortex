const babelJestMd = require('babel-jest');
const babelJest = babelJestMd.__esModule ? babelJestMd.default : babelJestMd;

module.exports = babelJest.createTransformer({
  presets: [
    [
      '@babel/preset-typescript',
      {
        jsxPragma: 'h',
      },
    ],
    '@babel/preset-env',
  ],
  plugins: [
    [
      '@babel/plugin-transform-react-jsx',
      {
        runtime: 'automatic',
        importSource: 'preact',
      },
    ],
    '@babel/plugin-proposal-class-properties',
  ],
  babelrc: false,
  configFile: false,
});

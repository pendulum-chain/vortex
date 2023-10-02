import { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'https://squid.subsquid.io/foucoco-squid/graphql',
  documents: ['**/*.{ts,tsx}', '!gql/**/*'],
  generates: {
    './gql/': {
      preset: 'client',
      plugins: [],
    },
  },
};

export default config;

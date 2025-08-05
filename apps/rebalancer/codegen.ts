import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  documents: ["**/*.{ts,tsx}", "!gql/**/*"],
  generates: {
    "./gql/": {
      plugins: [],
      preset: "client"
    }
  },
  schema: "https://pendulum.squids.live/pendulum-squid/graphql"
};

export default config;

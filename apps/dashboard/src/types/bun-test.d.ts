/**
 * Minimal declaration for the one `bun:test` API used in tests. The dashboard's tsconfig
 * deliberately keeps Bun out of the app's ambient types (`types: ["node", "vite/client"]`);
 * pulling in `@types/bun` wholesale would also redefine globals such as `fetch`.
 */
declare module "bun:test" {
  export const mock: {
    module: (specifier: string, factory: () => unknown) => void;
  };
}

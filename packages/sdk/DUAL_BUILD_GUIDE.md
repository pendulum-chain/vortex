# Dual Build Configuration (ESM + CommonJS)

This guide shows how to configure the SDK to publish both ESM and CommonJS formats for maximum compatibility.

## Option 1: Dual Package (Recommended)

Build both formats and use conditional exports:

### 1. Update package.json

```json
{
  "name": "@vortexfi/sdk",
  "version": "0.3.9",
  "type": "module",
  "main": "./dist/cjs/index.js",
  "module": "./dist/esm/index.js",
  "types": "./dist/types/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js",
      "types": "./dist/types/index.d.ts"
    }
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "npm run build:cjs && npm run build:esm && npm run build:types",
    "build:cjs": "bun build ./src/index.ts --outdir ./dist/cjs --target=node --format=cjs --external=@polkadot/api --external=stellar-sdk --external=viem",
    "build:esm": "bun build ./src/index.ts --outdir ./dist/esm --target=node --format=esm --external=@polkadot/api --external=stellar-sdk --external=viem",
    "build:types": "tsc -p tsconfig.json",
    "clean": "rm -rf ./dist"
  }
}
```

### 2. Update tsconfig.json

```json
{
  "compilerOptions": {
    "declaration": true,
    "declarationDir": "./dist/types",
    "emitDeclarationOnly": true,
    "module": "ESNext",
    "target": "ES2020",
    "lib": ["ES2020"],
    "moduleResolution": "node",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["./src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### 3. Create package.json for CommonJS output

Create `dist/cjs/package.json`:
```json
{
  "type": "commonjs"
}
```

This can be done in the build script or manually.

## Option 2: CommonJS Only (Simpler, Works with PythonMonkey)

### 1. Update package.json

```json
{
  "name": "@vortexfi/sdk",
  "type": "commonjs",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "rm -rf ./dist && npm run build:cjs && npm run build:types",
    "build:cjs": "bun build ./src/index.ts --outdir ./dist --target=node --format=cjs --external=@polkadot/api --external=stellar-sdk --external=viem",
    "build:types": "tsc -p tsconfig.json"
  }
}
```

### 2. Update tsconfig.json

```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "target": "ES2020",
    "declaration": true,
    "declarationDir": "./dist",
    "emitDeclarationOnly": true,
    "moduleResolution": "node",
    "strict": true,
    "skipLibCheck": true
  }
}
```

## Implications

### ✅ Pros of Dual Build (Option 1)

1. **Maximum Compatibility**: Works with ESM, CommonJS, and PythonMonkey
2. **No Breaking Changes**: Existing users continue to work
3. **Modern & Legacy**: Tree-shaking for modern bundlers, compatibility for older tools
4. **Future-Proof**: Ready for when PythonMonkey adds ESM support

### ✅ Pros of CommonJS Only (Option 2)

1. **Simpler Build**: Single output format
2. **Universal Compatibility**: Works everywhere (Node, PythonMonkey, bundlers)
3. **Smaller Package**: No duplicate code
4. **Easier Debugging**: Single source of truth

### ⚠️ Cons of CommonJS Only

1. **No Tree-Shaking**: Modern bundlers can't optimize unused code
2. **Larger Bundles**: Users importing one function get entire SDK
3. **Breaking Change**: Existing ESM users need to update imports
4. **Less Modern**: ESM is the future of JavaScript

### 📊 Impact on Your Project

**Current SDK users (TypeScript/JavaScript):**
- **Dual build**: No impact, seamless upgrade ✅
- **CommonJS only**: May need import syntax changes ⚠️

**PythonMonkey wrapper:**
- **Dual build**: Works with `require()` path ✅
- **CommonJS only**: Works perfectly ✅

**Bundle sizes:**
- **Dual build**: ~2x disk space (both formats)
- **CommonJS only**: Smaller npm package

**Other Python wrappers:**
- Node-based tools generally prefer CommonJS
- Makes SDK more accessible to non-JS environments

## Recommendation

**Use Option 1 (Dual Build)** because:

1. ✅ No breaking changes for existing users
2. ✅ Python wrapper works via CommonJS export
3. ✅ Modern bundlers get ESM for optimization
4. ✅ Future-compatible with all ecosystems
5. ✅ Minimal (~50KB) size increase

## Migration Path

### For Existing Users

```javascript
// ESM (still works)
import { VortexSdk } from '@vortexfi/sdk';

// CommonJS (now also works)
const { VortexSdk } = require('@vortexfi/sdk');
```

### For PythonMonkey

```python
# Now works with published npm package!
npm install @vortexfi/sdk
pm.require('@vortexfi/sdk')  # Uses CommonJS export
```

## Testing

After implementing, test both formats:

```bash
# Test CommonJS
node -e "const sdk = require('@vortexfi/sdk'); console.log(sdk)"

# Test ESM
node --input-type=module -e "import * as sdk from '@vortexfi/sdk'; console.log(sdk)"

# Test types
tsc --noEmit test.ts
```

## Build Script Enhancement

Add to `package.json`:

```json
{
  "scripts": {
    "postbuild": "node scripts/post-build.js"
  }
}
```

Create `scripts/post-build.js`:
```javascript
import fs from 'fs';
import path from 'path';

// Add package.json to CommonJS output
const cjsPackageJson = {
  type: 'commonjs'
};

fs.writeFileSync(
  path.join(process.cwd(), 'dist/cjs/package.json'),
  JSON.stringify(cjsPackageJson, null, 2)
);

console.log('✓ Post-build complete: CommonJS package.json created');

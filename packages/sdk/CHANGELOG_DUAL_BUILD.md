# Dual Build Implementation (v0.4.0)

## Summary

The Vortex SDK now publishes with **both ESM and CommonJS** formats, making it compatible with:
- ✅ Modern JavaScript/TypeScript projects (ESM)
- ✅ PythonMonkey and other CommonJS-only environments
- ✅ All bundlers and build tools
- ✅ Node.js (all versions)

## Changes Made

### 1. Package Structure
```
dist/
├── cjs/                    # CommonJS build
│   ├── index.js
│   └── package.json        # {"type": "commonjs"}
├── esm/                    # ESM build
│   └── index.js
└── types/                  # TypeScript definitions
    └── index.d.ts
```

### 2. Updated Files

#### `package.json`
- **main**: Points to CJS (`./dist/cjs/index.js`)
- **module**: Points to ESM (`./dist/esm/index.js`)
- **types**: Points to types (`./dist/types/index.d.ts`)
- **exports**: Conditional exports for modern resolution
- **build**: Now builds both formats

#### `tsconfig.json`
- **declarationDir**: Changed to `./dist/types`
- **target**: Changed to ES2020 for better compatibility
- **lib**: Simplified to ES2020

#### `scripts/post-build.js` (NEW)
- Creates `package.json` in `dist/cjs/` to mark it as CommonJS
- Runs automatically after build

### 3. Build Scripts

```bash
# Full build (runs all)
bun run build

# Individual builds
bun run build:cjs   # CommonJS
bun run build:esm   # ESM  
bun run build:types # TypeScript definitions
```

### 4. Testing

```bash
# Test both formats
bun run test

# Or manually:
node -e "const sdk = require('@vortexfi/sdk'); console.log('CJS:', sdk);"
node --input-type=module -e "import * as sdk from '@vortexfi/sdk'; console.log('ESM:', sdk);"
```

## Usage

### JavaScript/TypeScript (ESM)
```javascript
import { VortexSdk } from '@vortexfi/sdk';
```

### JavaScript/TypeScript (CommonJS)
```javascript
const { VortexSdk } = require('@vortexfi/sdk');
```

### PythonMonkey
```python
import pythonmonkey as pm
sdk = pm.require('@vortexfi/sdk')  # Automatically uses CJS
```

## Impact on Existing Projects

### ✅ No Breaking Changes
- ESM imports continue to work
- Tree-shaking still available for modern bundlers
- TypeScript types unchanged
- API surface unchanged

### 📦 Package Size
- Slight increase (~50KB) due to dual format
- Users only download what they use (via package manager deduplication)

## Publishing

```bash
# Build and publish
bun run build
npm publish
```

The npm package will include both formats, and Node.js/bundlers will automatically select the appropriate one based on the import method.

## Rollback Plan

If issues arise, revert to ESM-only by:
1. Remove dual build scripts
2. Restore original package.json exports
3. Use single build output

## Benefits

1. **Universal Compatibility**: Works with all JavaScript environments
2. **No Breaking Changes**: Existing users unaffected
3. **Modern Optimization**: ESM still available for tree-shaking
4. **Python Integration**: Enables PythonMonkey wrapper
5. **Future-Proof**: Ready for all ecosystems

## Version History

- **v0.3.9**: ESM only
- **v0.4.0**: Dual build (ESM + CommonJS)

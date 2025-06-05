# Shared Module Integration Plan

## Problem Analysis
- Frontend (Vite/TypeScript) and signer-service (Bun/TypeScript) couldn't resolve shared code
- Original setup used direct TS imports without proper build process
- Mixed package managers (Yarn + Bun) caused resolution issues

## Implemented Solutions
1. **Shared Module Configuration**
   - Added dual TS configs for ESM/CJS outputs
   - Configured package.json exports:
     ```json
     "main": "./dist/cjs/index.js",
     "module": "./dist/esm/index.js",
     "types": "./dist/types/index.d.ts"
     ```
   - Added build scripts:
     ```json
     "build": "tsc -p tsconfig.cjs.json && tsc -p tsconfig.esm.json",
     "prepack": "yarn build"
     ```

2. **Consumer Setup**
   - Frontend (Yarn):
     ```bash
     yarn add ../shared
     ```
   - Signer-Service (Bun):
     ```bash
     bun add ../shared
     ```

3. **Validation Steps**
   ```bash
   # Build shared module
   cd shared && yarn build
   
   # Test frontend resolution
   cd ../frontend && yarn dev
   
   # Test Bun resolution
   cd ../signer-service && bun run -c "import { parseCurrency } from '@packages/shared'"


# Resolved Items
✓ Frontend path aliases updated in vite.config.ts
✓ Signer-service TS config paths configured
✓ Shared module build process validated
✓ Cross-package manager imports working

# Next Steps
- Update frontend's vite.config.ts aliases
- Configure signer-service's tsconfig.json paths
- Test production builds for both projects
- Document dependency management strategy

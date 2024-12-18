# Vortex

[![Netlify Status](https://api.netlify.com/api/v1/badges/27783b79-512d-4205-89c1-d3ead6e3ed46/deploy-status)](https://app.netlify.com/sites/pendulum-pay/deploys)&nbsp;
![TypeScript](https://img.shields.io/badge/-TypeSript-05122A?style=flat&logo=typescript)&nbsp;
![Preact](https://img.shields.io/badge/-Preact-05122A?style=flat&logo=preact)&nbsp;
![Vite](https://img.shields.io/badge/-Vite-05122A?style=flat&logo=vite)&nbsp;
![Polkadot](https://img.shields.io/badge/-Polkadot-05122A?style=flat&logo=polkadot)&nbsp;
![Ethereum](https://img.shields.io/badge/-Ethereum-05122A?style=flat&logo=ethereum)&nbsp;

---

PendulumPay is a gateway for cross-border payments. It is built on top of the Pendulum blockchain.

## Run

In the project directory, you can run:

### `yarn install`

Install dependencies

### `yarn dev`

Runs the app in development mode.\
Open [http://127.0.0.1:5173/](http://127.0.0.1:5173) to view it in the browser.

## Build

### `yarn build`

Builds the app for production to the `dist` folder.\
It transpiles TypeScript, bundles Preact in production mode, splits and optimizes the builds for the best performance.

The build is minified and the filenames include the hashes.\
We call on `version.cjs` to show the commit version on the sidebar.\
We also create a file, on the fly, a file named `_redirects` that will serve the index.html instead of giving a 404 no
matter what URL the browser requests.

## Env Variables

- `VITE_SIGNING_SERVICE_PATH`: Optional variable to point to a specific signing backend service URL. If undefined, it
  will default to either:
  - `http://localhost:3000` (if in development mode)
  - `/api/production` (if in production mode)
    - this will use the `_redirects` file to direct Netlify to proxy all requests to `/api/production` to
      `https://prototype-signer-service-polygon.pendulumchain.tech`
  - `/api/staging` (if in staging mode)
    - this will use the `_redirects` file to direct Netlify to proxy all requests to `/api/staging` to
      `https://prototype-signer-service-polygon-staging.pendulumchain.tech`
- `VITE_ALCHEMY_API_KEY`: Optional variable to set the Alchemy API key for the custom RPC provider. If undefined, it
  will use dhe default endpoint.

## Fixing type issues

If you encounter issues with the IDE not detecting the type overwrites of the `@pendulum-chain/types` package properly,
make sure that all the `@polkadot/xxx` packages match the same version used in the types package. It is also important
to make sure that peer dependencies have the same version as this might also cause issues.

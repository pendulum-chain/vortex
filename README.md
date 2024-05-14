# PendulumPay

[//]:
  #
  '[![Netlify Status](https://api.netlify.com/api/v1/badges/aa69406a-f4a1-4693-aed0-8478f1d1fabd/deploy-status)](https://app.netlify.com/sites/pendulum-portal-alpha/deploys)'

&nbsp; ![TypeScript](https://img.shields.io/badge/-TypeSript-05122A?style=flat&logo=typescript)&nbsp;
![Preact](https://img.shields.io/badge/-Preact-05122A?style=flat&logo=preact)&nbsp;
![Vite](https://img.shields.io/badge/-Vite-05122A?style=flat&logo=vite)&nbsp;
![MUI](https://img.shields.io/badge/-MaterialUI-05122A?style=flat&logo=mui)&nbsp;
![Polkadot](https://img.shields.io/badge/-Polkadot-05122A?style=flat&logo=polkadot)&nbsp;

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

`VITE_SIGNING_SERVICE_URL`: Optional variable to point to a specific signing backend service URL. If undefined, it will default to either:
- http://localhost:3000 (if in development mode)
- https://prototype-signer-service.pendulumchain.tech (if in production mode)

## Fixing type issues

If you encounter issues with the IDE not detecting the type overwrites of the `@pendulum-chain/types` package properly,
make sure that all the `@polkadot/xxx` packages match the same version used in the types package. It is also important
to make sure that peer dependencies have the same version as this might also cause issues.

# Task: Unite and merge logic for on- and offramping tokens in backend

## Context

This project (Vortex) is a dapp that allows offramping stablecoins to different countries. Currently, the following
flows are supported:

- Offramping: Start with USDC or USDT on EVM chains or USDC on Assethub. Convert and offramp your tokens to either EUR,
  ARS, or BRL.
- Onramping: Start with BRL on your bank account. Convert the fiat BRL to the BRLA stablecoin and convert it to the
  target token. Send it to either an EVM chain or Assethub.

## Project structure

This project contains two sub projects: the frontend code resides in `/src` and the backend code resides in
`/api`. At the moment, the logic for ramping is scattered across these two but we want to move all the
relevant logic to the api.

### Offramp

For offramping, some data is required which is collected from the user in the frontend part of this project. This
includes, the 'sell amount' ie. the amount in USDC or USDT that I want to offramp, the target fiat token (BRL, EURO,
ARS), the user's wallet address and for brazilian user's also their target bank account.

### Onramp

For onramping, only BRL is supported at the moment. The user designates the amount they want to onramp in fiat BRL, the
token they want to receive at the end of the onramp, the target wallet address and the target network.

## Database

Some data needs to be stored in a database. This is not implemented yet. We want to set up a postgreSQL database for
storing all the relevant contextual information.

## api/backend requirements

The api needs to be resilient in the sense that a crash or restart at any given time still allows to continue
the process without any issues. This means that the on- and offramping phases needs to be fragmented into distinct
phases, where the api then moves between these phases like a state-machine. If the backend crashes during one
of the phases, it needs to continue and retry the phase afterwards without repeating any critical operation like
submitting transactions twice.

## Relevant files

- The relevant files for the api can be found in `/api/api/controllers`,
  `/api/api/routes`, and `/api/api/services`
- The relevant files for the frontend can be found in `/src/services`

## What needs to be done

- Read the relevant project files to understand how the onramping flow and offramping flow work in detail.
- Create new endpoints on the api to kick off an onramping flow and an offramping flow respectively. These
  endpoints will receive all the necessary contextual information to proceed with the flow from end to end without any
  additional interaction with the frontend.
- Create a new endpoint to poll the status of ramping flows. This endpoint would take the ID of a ramping flow and
  return the current phase that the process is in.

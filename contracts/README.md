# Contracts Workspace

This directory contains smart-contract projects managed as Bun workspaces.

## Structure

- `contracts/<project-name>/` - Independent contract project (Hardhat, Foundry, etc.)

## Conventions

- Workspace package names: `@vortexfi/contracts-<project-name>`
- Root scripts: `dev:contracts:<project-name>`, `compile:contracts:<project-name>`, `test:contracts:<project-name>`
- Keep generated outputs out of git (`artifacts`, `cache`, and similar tool outputs)

## Current projects

- `relayer/` - Relayer contract project (Hardhat)

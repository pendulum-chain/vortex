# Project Brief: Pendulum Pay Backend Migration

## Core Requirements

Pendulum Pay (Vortex) is a decentralized application (dapp) that enables users to on-ramp and off-ramp stablecoins to
different countries. The project requires migrating the ramping logic from the frontend to the backend to improve
resilience and maintainability.

## Goals

1. **Unify Ramping Logic**: Move all on-ramping and off-ramping logic from the frontend to the backend (signer-service).
2. **Implement State Persistence**: Create a PostgreSQL database to store ramping state information.
3. **Create Resilient Flows**: Design the backend to handle crashes and restarts without losing state.
4. **Support Presigned Transactions**: Allow the frontend to provide presigned transactions for the backend to execute.
5. **Provide Status Polling**: Create endpoints for the frontend to check the status of ramping processes.

## Scope

### In Scope

- Database schema design and implementation
- State machine for ramping flows
- API endpoints for quotes and ramping
- Transaction validation and execution
- Error handling and recovery mechanisms
- Background workers for cleanup tasks

### Out of Scope

- Frontend implementation changes
- User authentication and authorization
- Payment provider integrations
- Blockchain node infrastructure

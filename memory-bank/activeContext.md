# Active Context: Pendulum Pay Backend Migration

## Current Work Focus

We are currently focused on migrating the on-ramping and off-ramping logic from the frontend to the backend. This
involves:

1. Creating a PostgreSQL database schema for storing ramping state
2. Implementing a state machine for handling ramping flows
3. Developing API endpoints for quotes and ramping processes
4. Setting up background workers for cleanup tasks

The goal is to make the ramping process more resilient by storing state in a database and allowing the backend to handle
the flow progression, while still keeping the security benefits of having transactions signed on the frontend.

## Recent Changes

1. **Database Integration**

   - Added PostgreSQL connection configuration
   - Created models for quote tickets, ramp states, and idempotency keys
   - Implemented database migrations using Umzug

2. **API Endpoints**

   - Created `/v1/ramp/quotes` endpoints for quote generation
   - Added `/v1/ramp/start` for initiating ramping processes
   - Implemented `/v1/ramp/:id` for status polling
   - Added endpoints for phase and state updates

3. **Service Layer**

   - Implemented base service with common functionality
   - Created quote service for handling quote generation
   - Developed ramp service for managing ramping processes
   - Added validation for presigned transactions

4. **Background Processing**
   - Added cleanup worker for expired quotes and idempotency keys

## Next Steps

1. **Frontend Integration**

   - Update frontend to use the new backend endpoints
   - Modify transaction signing process to include phase information
   - Implement status polling for ramping processes

2. **Testing**

   - Create unit tests for the new services
   - Develop integration tests for the API endpoints
   - Test the ramping flows end-to-end

3. **Deployment**

   - Set up PostgreSQL database in production
   - Deploy the updated backend
   - Monitor the system for any issues

4. **Documentation**
   - Update API documentation
   - Create developer guides for the new endpoints
   - Document the database schema and migration process

## Active Decisions and Considerations

1. **Security Model**

   - We decided to keep the security model where private keys are never stored on the backend
   - The frontend will continue to create ephemeral accounts and pre-sign transactions
   - The backend will store and execute these presigned transactions at the appropriate phases

2. **State Machine Design**

   - We chose to implement the ramping flows as state machines with distinct phases
   - Each phase has a clear entry and exit point
   - The system can recover from crashes by checking the current phase and continuing from there

3. **Quote Expiration**

   - Quotes will expire after 10 minutes to ensure price accuracy
   - A background worker will clean up expired quotes
   - The frontend will need to request a new quote if the old one expires

4. **Idempotency**
   - We implemented idempotency keys to prevent duplicate operations
   - Keys are stored in the database and expire after 24 hours
   - The frontend can use these keys to safely retry operations

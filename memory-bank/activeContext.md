# Active Context: Pendulum Pay Features

## Current Work Focus
[2025-06-17] - Implementing Monerium integration as an alternative issuer/anchor for EUR transactions.

## Recent Changes
[2025-06-13 11:34:00] - Completed the design for the 'Under Maintenance' feature.
    - Database schema for `maintenance_schedules` defined.
    - API endpoint `GET /api/v1/maintenance/status` specified.
    - Design documented in `docs/architecture/maintenance-feature-design.md`.

[2025-06-13 11:40:00] - Completed implementation of the 'Under Maintenance' feature backend logic.
    - Created maintenance.service.ts with in-memory store for maintenance schedules.
    - Created maintenance.controller.ts with API endpoint handlers.
    - Created maintenance.route.ts with route definitions.
    - Registered maintenance routes in the main v1 router.
    - API endpoint GET /api/v1/maintenance/status is now functional.
    - Additional admin endpoints created for testing and management.

[2025-06-13 15:31:00] - Completed database integration for the 'Under Maintenance' feature.
    - Replaced in-memory store with PostgreSQL database integration using Sequelize ORM.
    - Created migration 007-maintenance-schedules-table.ts for the maintenance_schedules table.
    - Created MaintenanceSchedule model with proper field mappings and indexes.
    - Updated MaintenanceService to use database queries with Sequelize operations.
    - Fixed controller methods to handle async database operations.
    - Created seed script for testing with sample maintenance schedules.
    - Verified API endpoints are working correctly with database integration.
    - API endpoint GET /v1/maintenance/status returns proper responses based on database data.

[2025-06-17] - Started Monerium integration implementation.
    - Created Zustand store (moneriumStore.ts) to manage Monerium flow state
    - Implemented authentication service (moneriumAuth.ts) with OAuth PKCE flow
    - Created API service (monerium.service.ts) for backend communication
    - Created useMoneriumFlow hook to manage authentication state and redirects
    - Integrated Monerium flow into useSubmitRamp hook for EUR transactions
    - Updated useRegisterRamp to include Monerium auth data in ramp registration

## Next Steps
1. Backend implementation:
   - Create Monerium service endpoints for user status and auth validation
   - Implement routing logic to determine when to use Monerium vs Stellar anchors
   - Handle Monerium auth tokens in ramp registration
   - Implement offramp execution logic (backend-only)

2. Frontend refinements:
   - Test the complete authentication flow
   - Handle edge cases and error scenarios
   - Add loading states and user feedback
   - Ensure proper cleanup on component unmount

3. Integration testing:
   - Test new user signup flow
   - Test existing user SIWE login
   - Test ramp registration with Monerium auth data
   - Verify proper routing between Monerium and Stellar anchors

## Open Questions/Issues
- Need to implement actual backend routing logic to determine when to use Monerium
- Backend endpoints for Monerium user status and auth validation need to be created
- Offramp execution logic needs to be implemented on the backend

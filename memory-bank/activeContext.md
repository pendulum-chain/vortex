# Active Context: Pendulum Pay Features

## Current Work Focus
[2025-06-13 11:34:00] - Designing the 'Under Maintenance' feature, including database schema and API endpoints.

## Recent Changes
[2025-06-13 11:34:00] - Completed the design for the 'Under Maintenance' feature.
    - Database schema for `maintenance_schedules` defined.
    - API endpoint `GET /api/v1/maintenance/status` specified.
    - Design documented in `docs/architecture/maintenance-feature-design.md`.

## Open Questions/Issues
*

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

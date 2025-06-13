# Maintenance Mode Documentation

## User-Facing Documentation

### What is Maintenance Mode?
Maintenance mode is a temporary state of the Pendulum Pay application where certain functionalities are disabled to allow for system updates, improvements, or repairs. During this time, users may experience limited access to specific features.

### User Experience During Maintenance
When the application is in maintenance mode, users will see a prominent banner at the top of the interface indicating that maintenance is currently active. This banner will provide information about the maintenance period and any relevant messages.

Additionally, key actions that require confirmation will be disabled, preventing users from performing operations that may be affected by the ongoing maintenance.

---

## Technical Documentation

### Overview of Architecture
The maintenance mode feature is designed to provide a seamless experience for users while allowing administrators to manage maintenance schedules effectively. For a detailed architectural overview, please refer to the [Maintenance Feature Design Document](docs/architecture/maintenance-feature-design.md).

### Backend Implementation
The backend determines the maintenance status by querying the `maintenance_schedules` table in the PostgreSQL database. This table is managed by Sequelize and contains records that define the active maintenance windows.

#### API Endpoint
- **Endpoint:** `GET /api/v1/maintenance/status`
- **Response:**
  - The API returns a JSON object indicating whether the application is currently in maintenance mode and provides details about the active maintenance window, including:
    - `is_active`: Boolean indicating if maintenance is active.
    - `message_to_display`: A message to be shown to users during maintenance.

### Frontend Implementation
The frontend fetches the maintenance status from the API endpoint mentioned above. It utilizes the Zustand store for state management, caching the maintenance status to optimize performance.

When maintenance is active, the frontend displays a banner using the `MaintenanceBanner` component, which informs users of the ongoing maintenance. Additionally, key confirm actions are disabled through the `useMaintenanceAware` hook, ensuring that users cannot perform actions that may conflict with the maintenance process.

### Configuration
Maintenance windows are managed by inserting or updating records in the `maintenance_schedules` database table. The key fields in this table include:
- `title`: A brief title for the maintenance window.
- `start_datetime`: The start time of the maintenance period.
- `end_datetime`: The end time of the maintenance period.
- `message_to_display`: A message that will be shown to users during maintenance.
- `is_active_config`: A boolean indicating whether the maintenance window is currently active.

Administrators typically manage these records through direct database access or a future admin interface, as outlined in the original design document.

# Maintenance Mode

Status: implemented operational behavior.

Maintenance mode blocks new quote and ramp actions during a configured window while
leaving a public status endpoint available to the frontend.

## Runtime behavior

- `GET /v1/maintenance/status` is public and returns
  `is_maintenance_active` plus the active schedule details.
- Quote and ramp mutation routes use `rejectDuringActiveMaintenance` and reject new work
  while maintenance is active.
- The frontend loads the status into `maintenanceStore`, renders `MaintenanceBanner`, and
  disables affected actions.
- Schedule listing and activation changes are admin operations protected by admin auth.

Relevant code:

- `apps/api/src/api/routes/v1/maintenance.route.ts`
- `apps/api/src/api/services/maintenance.service.ts`
- `apps/api/src/api/middlewares/maintenanceGuard.ts`
- `apps/frontend/src/stores/maintenanceStore.ts`
- `apps/frontend/src/components/MaintenanceBanner/`

## Schedule data

The `maintenance_schedules` table stores:

| Field | Meaning |
|---|---|
| `title` | Operator-facing name |
| `start_datetime`, `end_datetime` | UTC activation window |
| `message_to_display` | User-facing explanation |
| `is_active_config` | Whether the schedule participates in activation |
| `notes` | Optional internal context |

The active schedule is one with `is_active_config = true` and a current time within its
half-open `[start_datetime, end_datetime)` window. The migration and Sequelize model own
the exact schema and indexes.

## Operating it

1. Create or update a schedule through an approved administrative path.
2. Verify its UTC window and user-facing message.
3. Activate it through the authenticated maintenance endpoint or controlled database
   access.
4. Confirm `GET /v1/maintenance/status` and the frontend banner before relying on the
   guard.
5. Deactivate or let the end time elapse, then confirm quote and ramp creation recover.

Do not expose maintenance administration in the partner API docs. Authentication and
route-surface requirements are covered by
[`security-spec/07-operations/api-surface.md`](security-spec/07-operations/api-surface.md).

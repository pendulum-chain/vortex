# Vortex Foundation Fee Refactoring Plan

**Date:** 2025-04-29

**Goal:** Move the Vortex Foundation fee configuration from the `fee_configurations` table to the `partners` table to treat it consistently with other partner fees.

**Assumptions:**

*   Only migration `001-initial-schema.ts` has been executed on the target database.
*   Migrations `002-partners-table.ts` and `04-fee-configurations-table.ts` can be modified directly without concern for breaking changes on existing deployments.

**Plan:**

1.  **Modify `api/src/database/migrations/002-partners-table.ts`:**
    *   **`up` function:** Add a `queryInterface.bulkInsert('partners', [...])` operation after the `addIndex` call to insert the Vortex Foundation partner record:
        *   `name`: `'vortex_foundation'`
        *   `display_name`: `'Vortex Foundation'`
        *   `markup_type`: `'relative'`
        *   `markup_value`: `0.01` (representing 0.01%)
        *   `markup_currency`: `'USD'`
        *   `payout_address`: `'6emGJgvN86YVYj5jENjfoMfEvX5p8hMHJGSYPpbtvHNEHTgy'`
        *   `is_active`: `true`
        *   `created_at`: `new Date()`
        *   `updated_at`: `new Date()`
    *   **`down` function:** Add a `queryInterface.bulkDelete('partners', { name: 'vortex_foundation' })` operation before the `dropTable` call to ensure the `down` migration correctly reverses the changes.

2.  **Modify `api/src/database/migrations/04-fee-configurations-table.ts`:**
    *   **`up` function:**
        *   In the `queryInterface.createTable('fee_configurations', ...)` call, modify the `fee_type` column definition: Remove `'vortex_foundation'` from the `ENUM` array. The new ENUM should be `('anchor_base', 'network_estimate')`.
        *   In the `queryInterface.bulkInsert('fee_configurations', [...])` call, remove the entire object corresponding to the `vortex_foundation` fee.
    *   **`down` function:** No changes are needed in the `down` function for this file.

**Visual Plan (Mermaid Diagram):**

```mermaid
graph TD
    A[Start: Refactor Vortex Fee] --> B{Read `002-partners-table.ts` Schema};
    B --> C{Read `004-fee-configurations-table.ts` Content};
    C --> D{Confirm Vortex Fee Value: 0.01%};
    D --> E[Develop Modification Plan];

    subgraph Modify 002-partners-table.ts
        direction TB
        F[Add `bulkInsert` for Vortex Partner in `up`]
        G[Add `bulkDelete` for Vortex Partner in `down`]
    end

    subgraph Modify 004-fee-configurations-table.ts
        direction TB
        H[Remove 'vortex_foundation' from `fee_type` ENUM in `up`]
        I[Remove Vortex Fee object from `bulkInsert` in `up`]
    end

    E --> F;
    E --> H;
    F --> G;
    H --> I;

    G --> J{Plan Complete};
    I --> J;

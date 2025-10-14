# Plan to Add `updateRamp` Endpoint

**Objective:** Introduce a new `updateRamp` endpoint to allow the frontend to submit presigned transactions and other necessary data *before* the `startRamp` endpoint is called. This enhances resilience by decoupling data submission from process initiation.

## Phase 1: Backend Changes (API)

1.  **Define DTOs for `updateRamp`:**
    *   Location: `packages/shared/src/endpoints/ramp.endpoints.ts`
    *   **`UpdateRampRequest`**:
        *   `rampId: string`
        *   `presignedTxs: PresignedTx[]`
        *   `additionalData?: { squidRouterApproveHash?: string; squidRouterSwapHash?: string; assethubToPendulumHash?: string; [key: string]: unknown; }` (consistent with data `startRamp` might need)
    *   **`UpdateRampResponse`**:
        *   `RampProcess` (the updated ramp process object)

2.  **`RampState` Model Considerations:**
    *   Location: `apps/api/src/models/rampState.model.ts`
    *   The `updateRamp` endpoint will populate fields within `RampState` that `startRamp` will consume.
    *   This will reuse existing fields or add new nullable fields to `RampState` if necessary to hold `presignedTxs` and `additionalData` directly.
    *   **No new database migration will be created for *separate "pending"* fields.** The aim is for `updateRamp` to set data that `startRamp` directly uses from the existing or slightly augmented `RampState` structure.

3.  **Implement `rampController.updateRamp`:**
    *   Location: `apps/api/src/api/controllers/ramp.controller.ts`
    *   **Logic:**
        *   Validate `rampId` and request payload.
        *   Retrieve the `RampState`.
        *   Return `409 Conflict` if ramp is not in a state allowing updates (e.g., already started, completed, failed).
        *   Store/update `presignedTxs` and `additionalData` directly in the `RampState` fields that `startRamp` will consume. Handle merging/replacement if called multiple times.
        *   Do NOT trigger phase transitions.
        *   Save updated `RampState`.
        *   Return the updated `RampProcess`.

4.  **Add Route for `updateRamp`:**
    *   Location: `apps/api/src/api/routes/v1/ramp.route.ts`
    *   Route: `router.post('/:rampId/update', rampController.updateRamp);`
    *   Add JSDoc API documentation.

5.  **Modify `rampController.startRamp`:**
    *   Location: `apps/api/src/api/controllers/ramp.controller.ts`
    *   **Logic Change:**
        *   `startRamp` will expect necessary `presignedTxs` and `additionalData` to be present in `RampState` (populated by `updateRamp`).
        *   The `StartRampRequest` DTO will be modified (see Phase 2, Step 1) to only require `rampId`.
        *   If required data is missing in `RampState` when `startRamp` is called, return an error (e.g., `400 Bad Request` or `422 Unprocessable Entity`).

6.  **Update `RampService` (Backend - `apps/api/src/api/services/ramp/ramp.service.ts`):**
    *   Reflect changes in how `startRamp` retrieves data (from `RampState`).

## Phase 2: Frontend Changes

1.  **Update `StartRampRequest` DTO (Shared Package):**
    *   Location: `packages/shared/src/endpoints/ramp.endpoints.ts`
    *   Modify `RampEndpoints.StartRampRequest` to:
        ```typescript
        export interface StartRampRequest {
          rampId: string;
        }
        ```
        (Remove `presignedTxs` and `additionalData` from this request DTO).

2.  **Add `updateRamp` to `RampService` (Frontend):**
    *   Location: `apps/frontend/src/services/api/ramp.service.ts`
    *   Add method:
        ```typescript
        static async updateRamp(
          rampId: string,
          presignedTxs: PresignedTx[],
          additionalData?: RampEndpoints.UpdateRampRequest['additionalData']
        ): Promise<RampEndpoints.UpdateRampResponse> {
          const request: RampEndpoints.UpdateRampRequest = {
            rampId,
            presignedTxs,
            additionalData,
          };
          return apiRequest<RampEndpoints.UpdateRampResponse>('post', `${this.BASE_PATH}/${rampId}/update`, request);
        }
        ```

3.  **Integrate `updateRamp` Call in `useRegisterRamp.ts`:**
    *   Location: `apps/frontend/src/hooks/offramp/useRampService/useRegisterRamp.ts`
    *   Call `RampService.updateRamp` after ephemeral transactions are signed.
    *   Call `RampService.updateRamp` again after user transactions are signed (for offramps), including user transaction hashes in `additionalData`.
    *   The backend will merge data from multiple calls.

4.  **Modify `startRamp` Call in Frontend:**
    *   Update calls to `RampService.startRamp` to only pass `rampId`.
    *   Ensure `startRamp` is called after all necessary `updateRamp` calls.

## Phase 3: Documentation

1.  **API Documentation:**
    *   Document the new `POST /v1/ramp/:rampId/update` endpoint in `apps/api/src/api/routes/v1/ramp.route.ts` (JSDoc).
    *   Update JSDoc for `POST /v1/ramp/start` to reflect its simplified request payload (only `rampId`).
    *   Update any relevant project documentation (e.g., in `/docs`) to describe the new `register` -> `update` (multiple times potentially) -> `start` flow.

2.  **Memory Bank Update:**
    *   Update `memory-bank/activeContext.md`: Note the ongoing work on this feature.
    *   Update `memory-bank/decisionLog.md`: Log the decision to add `updateRamp`, the rationale, and the choice to reuse/augment existing `RampState` fields rather than adding separate "pending" fields.
    *   Update `memory-bank/systemPatterns.md` or `memory-bank/phases.md` with the new flow diagram if significantly different.

## Flow Diagram

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant API as Backend API
    participant DB as Database (RampState)

    FE->>API: POST /v1/ramp/register (quoteId, signingAccounts, initialAdditionalData)
    API->>DB: Create RampState (initial state, unsignedTxs)
    API-->>FE: rampProcess (incl. rampId, unsignedTxs)

    FE->>FE: Sign Ephemeral Transactions (ephemeralPresignedTxs)
    FE->>API: POST /v1/ramp/{rampId}/update (rampId, ephemeralPresignedTxs)
    API->>DB: Store/Merge ephemeralPresignedTxs in RampState
    API-->>FE: Updated rampProcess

    opt Offramp User Signing
        FE->>FE: User signs transactions (userPresignedTxs, userTxHashes)
        FE->>API: POST /v1/ramp/{rampId}/update (rampId, userPresignedTxs, additionalData: {userTxHashes})
        API->>DB: Store/Merge userPresignedTxs and additionalData in RampState
        API-->>FE: Updated rampProcess
    end

    FE->>API: POST /v1/ramp/start (rampId)
    API->>DB: Read presignedTxs & additionalData from RampState
    API->>API: Process ramp using stored data (execute first phase)
    API->>DB: Update RampState (new phase)
    API-->>FE: Updated rampProcess (ramp started)

    loop Poll Status
        FE->>API: GET /v1/ramp/{rampId}
        API-->>FE: rampProcess (current status)
    end

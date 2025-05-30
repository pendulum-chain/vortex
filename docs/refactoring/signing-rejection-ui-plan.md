# Plan: Signing Rejection UI Updates

**Date:** 2025-04-25

**Goal:** Update the UI (button text and toast notification) when a user rejects a transaction signing during the off-ramp process.

**Core Idea:** Introduce a state variable in the central `rampStore` to track signing rejection, update it from the `useRegisterRamp` hook when rejection is detected, and use this state in the `RampSummaryButton` and to trigger a toast notification.

**Affected Files:**

*   `frontend/src/stores/rampStore.ts`
*   `frontend/src/hooks/offramp/useRampService/useRegisterRamp.ts`
*   `frontend/src/helpers/notifications.ts`
*   `frontend/src/components/RampSummaryDialog/RampSummaryButton.tsx`
*   Translation files (e.g., `frontend/src/translations/en.json`)

**Detailed Plan:**

1.  **Update State Management (`frontend/src/stores/rampStore.ts`):**
    *   **Add State:** Introduce a new boolean state variable `signingRejected` to the `RampZustand` type and the store's initial state (default: `false`).
    *   **Add Action:** Create a new action `setSigningRejected(rejected: boolean)` in `RampActions` and implement it in the store to update the `signingRejected` state.
    *   **Update Reset:** Modify the `resetRampState` action to also set `signingRejected` back to `false`.
    *   **Persistence:** Include `signingRejected` in the `saveState` function if necessary (though defaulting to `false` on load might be sufficient).
    *   **Export Hook:** Create and export a new hook `useSigningRejected` for components to easily access this state.

2.  **Update Signing Logic (`frontend/src/hooks/offramp/useRampService/useRegisterRamp.ts`):**
    *   **Import:** Import `useRampActions` from `rampStore` and `useToastMessage` from `helpers/notifications`.
    *   **Remove Local State:** Delete the `const [userDeclinedSigning, setUserDeclinedSigning] = useState(false);` line.
    *   **Handle Rejection:** In the `catch` block of the `requestSignaturesFromUser` function:
        *   Replace `setUserDeclinedSigning(true)` with a call to `actions.setSigningRejected(true)`.
        *   Instantiate the toast hook: `const { showToast, ToastMessage } = useToastMessage();`.
        *   Call `showToast(ToastMessage.SIGNING_REJECTED)`.
    *   **Reset Rejection State:** At the beginning of the `registerRampProcess` async function, add `actions.setSigningRejected(false)` to ensure the rejection state is cleared when a new registration/signing attempt starts.

3.  **Update Notifications (`frontend/src/helpers/notifications.ts`):**
    *   **Add Enum:** Add `SIGNING_REJECTED` to the `ToastMessage` enum.
    *   **Add Config:** Add an entry for `ToastMessage.SIGNING_REJECTED` in the `toastConfig` object. Use `type: 'warning'` or `'info'` and define a new translation key (e.g., `toasts.signingRejected`).
    *   **Add Translation:** Ensure the translation key `toasts.signingRejected` is added to the language files with the value "Request cancelled".

4.  **Update Button UI (`frontend/src/components/RampSummaryDialog/RampSummaryButton.tsx`):**
    *   **Import:** Import the new `useSigningRejected` hook from `rampStore`.
    *   **Consume State:** Inside the `useButtonContent` hook, get the rejection state: `const signingRejected = useSigningRejected();`.
    *   **Conditional Logic:** Add a condition within the `useMemo` block:
        ```javascript
        if (signingRejected) {
          return {
            text: t('components.dialogs.RampSummaryDialog.tryAgain'), // New translation key
            icon: null,
          };
        }
        ```
    *   **Add Translation:** Ensure the translation key `components.dialogs.RampSummaryDialog.tryAgain` is added to the language files with the value "Try again".

**Diagram (Simplified State Flow):**

```mermaid
sequenceDiagram
    participant User
    participant Wallet
    participant RampSummaryButton
    participant useRegisterRamp
    participant rampStore
    participant Notifications

    User->>RampSummaryButton: Clicks 'Confirm'/'Continue'
    RampSummaryButton->>useRegisterRamp: Triggers signing process (indirectly via state changes)
    useRegisterRamp->>rampStore: actions.setSigningRejected(false)
    useRegisterRamp->>Wallet: Request Signature(s)
    alt User Rejects
        Wallet-->>useRegisterRamp: Rejection Error
        useRegisterRamp->>rampStore: actions.setSigningRejected(true)
        useRegisterRamp->>Notifications: showToast(SIGNING_REJECTED)
        Notifications->>User: Display "Request cancelled" toast
        rampStore-->>RampSummaryButton: Update signingRejected=true
        RampSummaryButton->>User: Update button text to "Try again"
    else User Approves
        Wallet-->>useRegisterRamp: Signature(s)
        useRegisterRamp->>useRegisterRamp: Process signatures...
        useRegisterRamp->>rampStore: Update rampState, etc.
        rampStore-->>RampSummaryButton: Update state (no rejection)
        RampSummaryButton->>User: Show "Processing" or next step
    end

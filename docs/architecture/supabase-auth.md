# Supabase Auth Integration

## Overview

This architectural document describes the integration of Supabase Authentication into Vortex. The system uses a passwordless Email OTP flow, leveraging Supabase's infrastructure for identity management while maintaining user-related data in our local PostgreSQL database.

## Architecture

### User Flow

The authentication flow is designed to be unobtrusive, allowing users to browse and calculate quotes before being required to identify themselves.

1.  **Quote Creation**: Unauthenticated users can view and calculate quotes.
2.  **Confirmation**: When a user clicks "Confirm" on a quote, the system checks for an active session.
3.  **Authentication**:
    *   If no session exists, the user is prompted for their email.
    *   **OTP**: A one-time password is sent to their email (via Supabase).
    *   **Verification**: User enters the code. On success, access and refresh tokens are issued and stored locally.
4.  **Transaction**: Authenticated user proceeds to the ramp transaction. `user_id` is now attached to the created resources.

### Data Model

We utilize Supabase's `auth` schema for identity management but strictly separate our application data.

*   **`auth.users`**: Internal Supabase table storing identity, email, and encrypted passwords (unused here).
*   **`public.profiles`**: Our local table that extends the auth user, linked 1:1 with `auth.users`.
    *   *Note*: This table was explicitly named `profiles` to avoid conflicts with `auth.users`.
*   **Entity Linking**: The following core entities reference the Supabase `user_id` (UUID) to maintain ownership:
    *   `quote_tickets`
    *   `ramp_states`
    *   `kyc_level_2`
    *   `tax_ids`

## Backend Architecture

The backend acts as a bridge between the frontend and Supabase, ensuring data integrity without handling sensitive credential storage.

### Tech Stack
*   **Framework**: Express
*   **Auth Client**: `@supabase/supabase-js`
*   **Database**: PostgreSQL (via Sequelize)

### Service Layer
The **Auth Service** encapsulates interactions with Supabase:
*   **Admin Client**: Used for privileged operations like checking if a user exists (`admin.listUsers`) without logging them in.
*   **Anon Client**: Used for standard operations like `signInWithOtp` and `verifyOtp`.

### Middleware
*   **`requireAuth`**: Validates the `Bearer` token against Supabase using `getUser()`. Attaches `userId` to the request object.
*   **`optionalAuth`**: checks for a token but continues even if invalid/missing (useful for mixed-access endpoints).

### API Endpoints
All auth-related operational endpoints are grouped under `/api/v1/auth`:
*   `GET /check-email`: Checks if a user exists (determines Sign In vs Sign Up UI flow).
*   `POST /request-otp`: Triggers the email OTP.
*   `POST /verify-otp`: Exchanges OTP for session tokens.
*   `POST /refresh`: Rotates expired access tokens using the refresh token.
*   `POST /verify`: Validates a token server-side.

## Frontend Architecture

The frontend manages the user session and guides the user through the auth steps within the transaction flow.

### Tech Stack
*   **Framework**: React
*   **State Management**: XState
*   **Client**: `@supabase/supabase-js`

### State Machine Integration
The `rampMachine` handles the authentication lifecycle as a distinct phase in the transaction flow.

*   **States**:
    *   `CheckAuth`: Decides whether to skip to `RampRequested` or enter the auth flow.
    *   `EnterEmail` / `CheckingEmail`: Captures and validates email.
    *   `RequestingOTP`: Calls API to send code.
    *   `EnterOTP` / `VerifyingOTP`: Captures code and exchanges for tokens.
*   **Transitions**: The flow blocks the "Confirm" action until `AUTH_SUCCESS` is reached, ensuring no quote is finalized without a user.

### Token Management
*   **Storage**: `localStorage` is used to store `access_token`, `refresh_token`, and `user_id`.
*   **Auto-Refresh**: A background process (via `useAuthTokens` hook) monitors token validity and refreshes them automatically ~5 minutes before expiry to prevent session interruption during long flows.

### UI Components
The auth UI is embedded directly into the widget flow rather than a separate page:
*   `AuthEmailStep`: Simple email input with existence check.
*   `AuthOTPStep`: 6-digit code input with auto-submit and paste support.

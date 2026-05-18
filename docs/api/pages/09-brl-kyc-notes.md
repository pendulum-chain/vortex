# 9. BRL / KYC Notes

BRL routes require user onboarding with Vortex's local payment partner before ramping. The user's Brazilian tax ID, either CPF for individuals or CNPJ for businesses, is used as the primary identifier.

Level 1 onboarding collects basic identity information and enables lower-limit BRL flows. Level 2 adds document and liveness verification and may be required for higher limits or stricter compliance rules.

The SDK ramp flow assumes that the user is eligible for the selected corridor. If the user has not completed the required onboarding, the ramp may fail or require additional account-management steps.

Partner integrations cannot drive BRLA KYC directly with only `sk_*` or `pk_*` keys. BRLA endpoints are first-party, user-oriented flows and rely on a Vortex-authenticated user context rather than partner key authentication.

KYC endpoints are documented for first-party flows and account-management integrations. They should not be treated as the primary SDK ramp flow. When possible, use the Vortex application or hosted widget to complete onboarding before ramp execution.

---

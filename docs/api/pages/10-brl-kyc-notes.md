# 10. BRL / KYC Notes

BRL routes require user onboarding with Vortex's local payment partner before ramping. The user's Brazilian tax ID, either CPF for individuals or CNPJ for businesses, is used as the primary identifier.

Level 1 onboarding collects basic identity information and enables lower-limit BRL flows. Level 2 adds document and liveness verification and may be required for higher limits or stricter compliance rules.

The SDK ramp flow assumes that the user is eligible for the selected corridor. If the user has not completed the required onboarding, the ramp may fail or require additional account-management steps.

KYC endpoints are available for account-management integrations, but they should not be treated as the primary SDK ramp flow. When possible, use the Vortex application or a dedicated onboarding flow to complete KYC before ramp execution.

---

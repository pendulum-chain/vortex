import CustomerEntity from "../../models/customerEntity.model";

/**
 * Resolves the customer entity owned by a profile, creating the default `individual`
 * entity on first touch. Migration 038 backfilled one entity per existing profile and
 * verify-otp creates one for new sign-ups, but users with pre-existing sessions never
 * re-verify — every entity-scoped read path must tolerate that via this lazy fallback.
 */
export async function getOrCreateCustomerEntityForProfile(profileId: string): Promise<CustomerEntity> {
  const [entity] = await CustomerEntity.findOrCreate({
    defaults: {
      profileId,
      status: "active",
      type: "individual"
    },
    where: { profileId }
  });
  return entity;
}

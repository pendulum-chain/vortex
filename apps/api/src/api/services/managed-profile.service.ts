import type { User as SupabaseUser } from "@supabase/supabase-js";
import { col, fn, Transaction, UniqueConstraintError, where } from "sequelize";
import sequelize from "../../config/database";
import { supabaseAdmin } from "../../config/supabase";
import Partner from "../../models/partner.model";
import PartnerManagedProfile, { type ManagedProfileSubjectType } from "../../models/partnerManagedProfile.model";
import User from "../../models/user.model";
import { selectActiveCustomerEntity } from "./customer-entity.service";

const PARTNER_METADATA_KEY = "vortex_managed_profile_partner_id";
const EXTERNAL_USER_METADATA_KEY = "vortex_managed_profile_external_user_id";

export class ManagedProfileServiceError extends Error {
  constructor(
    readonly code:
      | "MANAGED_PROFILE_CONFLICT"
      | "MANAGED_PROFILE_INVALID_INPUT"
      | "MANAGED_PROFILE_PARTNER_NOT_FOUND"
      | "MANAGED_PROFILE_UPSTREAM_ERROR",
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export interface CreateManagedProfileInput {
  email: string;
  externalUserId: string;
  partnerId: string;
  subjectType: ManagedProfileSubjectType;
}

export interface ManagedProfileResult {
  claimedAt: Date | null;
  created: boolean;
  email: string;
  externalUserId: string;
  id: string;
  partnerId: string;
  profileId: string;
  subjectType: ManagedProfileSubjectType;
}

export function normalizeManagedProfileEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hasAssociationMetadata(user: SupabaseUser, partnerId: string, externalUserId: string): boolean {
  return (
    user.app_metadata?.[PARTNER_METADATA_KEY] === partnerId &&
    user.app_metadata?.[EXTERNAL_USER_METADATA_KEY] === externalUserId
  );
}

async function findSupabaseUserByEmail(email: string): Promise<SupabaseUser | null> {
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new ManagedProfileServiceError("MANAGED_PROFILE_UPSTREAM_ERROR", "Could not reconcile the Auth identity");
    }
    const match = data.users.find(user => normalizeManagedProfileEmail(user.email ?? "") === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
}

// Only a duplicate-email rejection means an identity to reconcile already exists. Any other
// Auth failure (rate limit, outage) must surface as an upstream error rather than a conflict,
// and must not trigger the full-directory scan below.
const EXISTING_EMAIL_CODES = new Set(["email_exists", "user_already_exists"]);

async function createOrReconcileAuthUser(input: CreateManagedProfileInput, email: string): Promise<SupabaseUser> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    app_metadata: {
      [EXTERNAL_USER_METADATA_KEY]: input.externalUserId,
      [PARTNER_METADATA_KEY]: input.partnerId
    },
    email,
    email_confirm: false
  });

  if (!error && data.user) return data.user;
  if (!error || !error.code || !EXISTING_EMAIL_CODES.has(error.code)) {
    throw new ManagedProfileServiceError("MANAGED_PROFILE_UPSTREAM_ERROR", "Could not create the Auth identity");
  }

  const existing = await findSupabaseUserByEmail(email);
  if (!existing || !hasAssociationMetadata(existing, input.partnerId, input.externalUserId)) {
    throw new ManagedProfileServiceError(
      "MANAGED_PROFILE_CONFLICT",
      "The email belongs to a different Auth identity or managed-profile association"
    );
  }
  return existing;
}

function result(association: PartnerManagedProfile, email: string, created: boolean): ManagedProfileResult {
  return {
    claimedAt: association.claimedAt,
    created,
    email,
    externalUserId: association.externalUserId,
    id: association.id,
    partnerId: association.partnerId,
    profileId: association.profileId,
    subjectType: association.subjectType
  };
}

async function existingAssociationResult(
  association: PartnerManagedProfile,
  email: string,
  subjectType: ManagedProfileSubjectType
): Promise<ManagedProfileResult> {
  const profile = await User.findByPk(association.profileId, { attributes: ["email"] });
  if (!profile || normalizeManagedProfileEmail(profile.email) !== email || association.subjectType !== subjectType) {
    throw new ManagedProfileServiceError(
      "MANAGED_PROFILE_CONFLICT",
      "The external user ID is already associated with different profile data"
    );
  }
  return result(association, email, false);
}

export async function createManagedProfile(input: CreateManagedProfileInput): Promise<ManagedProfileResult> {
  const email = normalizeManagedProfileEmail(input.email);
  if (!email || !input.externalUserId.trim()) {
    throw new ManagedProfileServiceError("MANAGED_PROFILE_INVALID_INPUT", "email and externalUserId must be non-empty strings");
  }

  const existing = await PartnerManagedProfile.findOne({
    where: { externalUserId: input.externalUserId, partnerId: input.partnerId }
  });
  if (existing) return existingAssociationResult(existing, email, input.subjectType);

  if (!(await Partner.findByPk(input.partnerId, { attributes: ["id"] }))) {
    throw new ManagedProfileServiceError("MANAGED_PROFILE_PARTNER_NOT_FOUND", "Partner not found");
  }

  const authUser = await createOrReconcileAuthUser(input, email);
  if (normalizeManagedProfileEmail(authUser.email ?? "") !== email) {
    throw new ManagedProfileServiceError("MANAGED_PROFILE_CONFLICT", "The Auth identity email does not match the request");
  }

  try {
    return await sequelize.transaction(async transaction => {
      const association = await PartnerManagedProfile.findOne({
        lock: Transaction.LOCK.UPDATE,
        transaction,
        where: { externalUserId: input.externalUserId, partnerId: input.partnerId }
      });
      if (association) return existingAssociationResult(association, email, input.subjectType);

      const profileForEmail = await User.findOne({ transaction, where: where(fn("lower", col("email")), email) });
      if (profileForEmail && profileForEmail.id !== authUser.id) {
        throw new ManagedProfileServiceError("MANAGED_PROFILE_CONFLICT", "The email is already linked to a different profile");
      }

      const profile = await User.findByPk(authUser.id, { lock: Transaction.LOCK.UPDATE, transaction });
      if (profile && normalizeManagedProfileEmail(profile.email) !== email) {
        throw new ManagedProfileServiceError(
          "MANAGED_PROFILE_CONFLICT",
          "The Auth identity is already linked to a profile with a different email"
        );
      }
      if (!profile) await User.create({ email, id: authUser.id }, { transaction });

      const profileAssociation = await PartnerManagedProfile.findOne({ transaction, where: { profileId: authUser.id } });
      if (profileAssociation) {
        throw new ManagedProfileServiceError(
          "MANAGED_PROFILE_CONFLICT",
          "The profile is already used by another partner association"
        );
      }

      if (input.subjectType !== "technical") {
        await selectActiveCustomerEntity(authUser.id, input.subjectType, transaction);
      }

      const created = await PartnerManagedProfile.create(
        {
          externalUserId: input.externalUserId,
          partnerId: input.partnerId,
          profileId: authUser.id,
          subjectType: input.subjectType
        },
        { transaction }
      );
      return result(created, email, true);
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      const association = await PartnerManagedProfile.findOne({
        where: { externalUserId: input.externalUserId, partnerId: input.partnerId }
      });
      if (association) return existingAssociationResult(association, email, input.subjectType);
      throw new ManagedProfileServiceError(
        "MANAGED_PROFILE_CONFLICT",
        "The profile is already used by another partner association"
      );
    }
    throw error;
  }
}

export async function markManagedProfileClaimed(profileId: string): Promise<ManagedProfileSubjectType | null> {
  const association = await PartnerManagedProfile.findOne({ where: { profileId } });
  if (!association) return null;
  if (!association.claimedAt) await association.update({ claimedAt: new Date() });
  return association.subjectType;
}

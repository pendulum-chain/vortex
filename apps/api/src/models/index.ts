import sequelize from "../config/database";
import AdminImpersonationSession from "./adminImpersonationSession.model";
import Anchor from "./anchor.model";
import ApiClientEvent from "./apiClientEvent.model";
import ApiCredential from "./apiCredential.model";
import CustomerEntity from "./customerEntity.model";
import EmailNotification from "./emailNotification.model";
import FinancialOperation from "./financialOperation.model";
import KycCase from "./kycCase.model";
import MaintenanceSchedule from "./maintenanceSchedule.model";
import ManagedProfile from "./managedProfile.model";
import ManagedProfileManager from "./managedProfileManager.model";
import ManagedProfileMembership from "./managedProfileMembership.model";
import ManagedProfileMembershipEvent from "./managedProfileMembershipEvent.model";
import ManagedProfileMembershipInvitation from "./managedProfileMembershipInvitation.model";
import Notification from "./notification.model";
import NotificationPreference from "./notificationPreference.model";
import Partner from "./partner.model";
import PartnerManagedProfile from "./partnerManagedProfile.model";
import PartnerPricingConfig from "./partnerPricingConfig.model";
import ProfilePartnerAssignment from "./profilePartnerAssignment.model";
import ProfileRole from "./profileRole.model";
import ProviderCustomer from "./providerCustomer.model";
import QuoteTicket from "./quoteTicket.model";
import RampState from "./rampState.model";
import RecipientInvitation from "./recipientInvitation.model";
import RecipientPayoutReference from "./recipientPayoutReference.model";
import SenderRecipient from "./senderRecipient.model";
import Subsidy from "./subsidy.model";
import User from "./user.model";
import Webhook from "./webhook.model";

// Define associations
RampState.belongsTo(QuoteTicket, { as: "quote", foreignKey: "quoteId" });
QuoteTicket.hasOne(RampState, { as: "rampState", foreignKey: "quoteId" });
QuoteTicket.belongsTo(Partner, { as: "partner", foreignKey: "partnerId" });
Partner.hasMany(QuoteTicket, { as: "quotes", foreignKey: "partnerId" });
QuoteTicket.belongsTo(Partner, { as: "pricingPartner", foreignKey: "pricingPartnerId" });
Partner.hasMany(QuoteTicket, { as: "pricedQuotes", foreignKey: "pricingPartnerId" });
RampState.hasMany(Subsidy, { as: "subsidies", foreignKey: "rampId" });
Subsidy.belongsTo(RampState, { as: "rampState", foreignKey: "rampId" });

// User associations
User.hasMany(QuoteTicket, { as: "quoteTickets", foreignKey: "userId" });
QuoteTicket.belongsTo(User, { as: "user", foreignKey: "userId" });

User.hasMany(RampState, { as: "rampStates", foreignKey: "userId" });
RampState.belongsTo(User, { as: "user", foreignKey: "userId" });

User.hasMany(EmailNotification, { as: "emailNotifications", foreignKey: "userId" });
EmailNotification.belongsTo(User, { as: "user", foreignKey: "userId" });

User.hasMany(ProfilePartnerAssignment, { as: "partnerAssignments", foreignKey: "userId" });
ProfilePartnerAssignment.belongsTo(User, { as: "user", foreignKey: "userId" });

User.hasMany(ProfileRole, { as: "roles", foreignKey: "userId" });
ProfileRole.belongsTo(User, { as: "user", foreignKey: "userId" });

User.hasMany(AdminImpersonationSession, { as: "impersonationsPerformed", foreignKey: "actorProfileId" });
AdminImpersonationSession.belongsTo(User, { as: "actor", foreignKey: "actorProfileId" });
User.hasMany(AdminImpersonationSession, { as: "impersonationsReceived", foreignKey: "targetProfileId" });
AdminImpersonationSession.belongsTo(User, { as: "target", foreignKey: "targetProfileId" });

User.hasMany(ApiCredential, { as: "apiCredentials", foreignKey: "profileId" });
ApiCredential.belongsTo(User, { as: "profile", foreignKey: "profileId" });
Partner.hasMany(ApiCredential, { as: "apiCredentials", foreignKey: "partnerId" });
ApiCredential.belongsTo(Partner, { as: "partner", foreignKey: "partnerId" });

User.hasOne(PartnerManagedProfile, { as: "managedProfile", foreignKey: "profileId" });
PartnerManagedProfile.belongsTo(User, { as: "profile", foreignKey: "profileId" });
Partner.hasMany(PartnerManagedProfile, { as: "managedProfiles", foreignKey: "partnerId" });
PartnerManagedProfile.belongsTo(Partner, { as: "partner", foreignKey: "partnerId" });

User.hasOne(ManagedProfileManager, { as: "managedProfileManager", foreignKey: "profileId" });
ManagedProfileManager.belongsTo(User, { as: "profile", foreignKey: "profileId" });
User.hasOne(ManagedProfile, { as: "managedProfileRelationship", foreignKey: "profileId" });
ManagedProfile.belongsTo(User, { as: "profile", foreignKey: "profileId" });
ManagedProfileManager.hasMany(ManagedProfile, { as: "managedProfiles", foreignKey: "managerProfileId" });
ManagedProfile.belongsTo(ManagedProfileManager, { as: "manager", foreignKey: "managerProfileId" });
ManagedProfileManager.hasMany(ManagedProfileMembership, {
  as: "memberships",
  foreignKey: "ownerProfileId",
  sourceKey: "profileId"
});
ManagedProfileMembership.belongsTo(ManagedProfileManager, {
  as: "organization",
  foreignKey: "ownerProfileId",
  targetKey: "profileId"
});
ManagedProfileManager.hasMany(ManagedProfileMembershipInvitation, {
  as: "membershipInvitations",
  foreignKey: "ownerProfileId",
  sourceKey: "profileId"
});
ManagedProfileMembershipInvitation.belongsTo(ManagedProfileManager, {
  as: "organization",
  foreignKey: "ownerProfileId",
  targetKey: "profileId"
});
ManagedProfileManager.hasMany(ManagedProfileMembershipEvent, {
  as: "membershipEvents",
  foreignKey: "ownerProfileId",
  sourceKey: "profileId"
});
ManagedProfileMembershipEvent.belongsTo(ManagedProfileManager, {
  as: "organization",
  foreignKey: "ownerProfileId",
  targetKey: "profileId"
});
User.hasMany(ManagedProfileMembership, { as: "managedProfileMemberships", foreignKey: "memberProfileId" });
ManagedProfileMembership.belongsTo(User, { as: "memberProfile", foreignKey: "memberProfileId" });
User.hasMany(ManagedProfileMembership, { as: "createdManagedProfileMemberships", foreignKey: "createdByProfileId" });
ManagedProfileMembership.belongsTo(User, { as: "createdByProfile", foreignKey: "createdByProfileId" });
User.hasMany(ManagedProfileMembership, { as: "revokedManagedProfileMemberships", foreignKey: "revokedByProfileId" });
ManagedProfileMembership.belongsTo(User, { as: "revokedByProfile", foreignKey: "revokedByProfileId" });
User.hasMany(ManagedProfileMembershipInvitation, {
  as: "managedProfileMembershipInvitationsSent",
  foreignKey: "invitedByProfileId"
});
ManagedProfileMembershipInvitation.belongsTo(User, { as: "invitedByProfile", foreignKey: "invitedByProfileId" });
User.hasMany(ManagedProfileMembershipInvitation, {
  as: "managedProfileMembershipInvitationsAccepted",
  foreignKey: "acceptedByProfileId"
});
ManagedProfileMembershipInvitation.belongsTo(User, { as: "acceptedByProfile", foreignKey: "acceptedByProfileId" });
User.hasMany(ManagedProfileMembershipInvitation, {
  as: "managedProfileMembershipInvitationsCancelled",
  foreignKey: "cancelledByProfileId"
});
ManagedProfileMembershipInvitation.belongsTo(User, { as: "cancelledByProfile", foreignKey: "cancelledByProfileId" });
ManagedProfileMembershipInvitation.hasMany(ManagedProfileMembershipEvent, {
  as: "events",
  foreignKey: "invitationId"
});
ManagedProfileMembershipEvent.belongsTo(ManagedProfileMembershipInvitation, {
  as: "invitation",
  foreignKey: "invitationId"
});
User.hasMany(ManagedProfileMembershipEvent, { as: "managedProfileMembershipEventsActed", foreignKey: "actorProfileId" });
ManagedProfileMembershipEvent.belongsTo(User, { as: "actorProfile", foreignKey: "actorProfileId" });
User.hasMany(ManagedProfileMembershipEvent, { as: "managedProfileMembershipEventsReceived", foreignKey: "memberProfileId" });
ManagedProfileMembershipEvent.belongsTo(User, { as: "memberProfile", foreignKey: "memberProfileId" });

// Partner pricing split
Partner.hasMany(PartnerPricingConfig, { as: "pricingConfigs", foreignKey: "partnerId" });
PartnerPricingConfig.belongsTo(Partner, { as: "partner", foreignKey: "partnerId" });
ProfilePartnerAssignment.belongsTo(Partner, { as: "partner", foreignKey: "partnerId" });
Partner.hasMany(ProfilePartnerAssignment, { as: "profileAssignments", foreignKey: "partnerId" });

// Customer entity — owner anchor between profiles and provider/KYC records
User.hasMany(CustomerEntity, { as: "customerEntities", foreignKey: "profileId" });
CustomerEntity.belongsTo(User, { as: "profile", foreignKey: "profileId" });
User.belongsTo(CustomerEntity, { as: "activeCustomerEntity", foreignKey: "activeCustomerEntityId" });
CustomerEntity.hasMany(ProviderCustomer, { as: "providerCustomers", foreignKey: "customerEntityId" });
ProviderCustomer.belongsTo(CustomerEntity, { as: "customerEntity", foreignKey: "customerEntityId" });
CustomerEntity.hasMany(KycCase, { as: "kycCases", foreignKey: "customerEntityId" });
KycCase.belongsTo(CustomerEntity, { as: "customerEntity", foreignKey: "customerEntityId" });
ProviderCustomer.hasMany(KycCase, { as: "kycCases", foreignKey: "providerCustomerId" });
KycCase.belongsTo(ProviderCustomer, { as: "providerCustomer", foreignKey: "providerCustomerId" });

// Recipient graph
CustomerEntity.hasMany(RecipientInvitation, { as: "sentInvitations", foreignKey: "senderCustomerEntityId" });
RecipientInvitation.belongsTo(CustomerEntity, { as: "sender", foreignKey: "senderCustomerEntityId" });
CustomerEntity.hasMany(SenderRecipient, { as: "recipients", foreignKey: "senderCustomerEntityId" });
SenderRecipient.belongsTo(CustomerEntity, { as: "sender", foreignKey: "senderCustomerEntityId" });
CustomerEntity.hasMany(SenderRecipient, { as: "senders", foreignKey: "recipientCustomerEntityId" });
SenderRecipient.belongsTo(CustomerEntity, { as: "recipient", foreignKey: "recipientCustomerEntityId" });
SenderRecipient.belongsTo(RecipientInvitation, { as: "invitation", foreignKey: "invitationId" });
RecipientInvitation.hasOne(SenderRecipient, { as: "relationship", foreignKey: "invitationId" });
SenderRecipient.hasMany(RecipientPayoutReference, { as: "payoutReferences", foreignKey: "senderRecipientId" });
RecipientPayoutReference.belongsTo(SenderRecipient, { as: "senderRecipient", foreignKey: "senderRecipientId" });
RecipientPayoutReference.belongsTo(CustomerEntity, { as: "recipient", foreignKey: "recipientCustomerEntityId" });

// Notifications
User.hasMany(Notification, { as: "notifications", foreignKey: "profileId" });
Notification.belongsTo(User, { as: "profile", foreignKey: "profileId" });
User.hasOne(NotificationPreference, { as: "notificationPreference", foreignKey: "profileId" });
NotificationPreference.belongsTo(User, { as: "profile", foreignKey: "profileId" });

// Initialize models
const models = {
  AdminImpersonationSession,
  Anchor,
  ApiClientEvent,
  ApiCredential,
  CustomerEntity,
  EmailNotification,
  FinancialOperation,
  KycCase,
  MaintenanceSchedule,
  ManagedProfile,
  ManagedProfileManager,
  ManagedProfileMembership,
  ManagedProfileMembershipEvent,
  ManagedProfileMembershipInvitation,
  Notification,
  NotificationPreference,
  Partner,
  PartnerManagedProfile,
  PartnerPricingConfig,
  ProfilePartnerAssignment,
  ProfileRole,
  ProviderCustomer,
  QuoteTicket,
  RampState,
  RecipientInvitation,
  RecipientPayoutReference,
  SenderRecipient,
  Subsidy,
  User,
  Webhook
};

// Export models and sequelize instance
export { sequelize };
export default models;

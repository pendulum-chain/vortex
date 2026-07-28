import sequelize from "../config/database";
import Anchor from "./anchor.model";
import ApiClientEvent from "./apiClientEvent.model";
import ApiKey from "./apiKey.model";
import CustomerEntity from "./customerEntity.model";
import KycCase from "./kycCase.model";
import MaintenanceSchedule from "./maintenanceSchedule.model";
import Notification from "./notification.model";
import NotificationPreference from "./notificationPreference.model";
import Partner from "./partner.model";
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
import TaxId from "./taxId.model";
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

User.hasMany(TaxId, { as: "taxIds", foreignKey: "userId" });
TaxId.belongsTo(User, { as: "user", foreignKey: "userId" });

User.hasMany(ProfilePartnerAssignment, { as: "partnerAssignments", foreignKey: "userId" });
ProfilePartnerAssignment.belongsTo(User, { as: "user", foreignKey: "userId" });

User.hasMany(ProfileRole, { as: "roles", foreignKey: "userId" });
ProfileRole.belongsTo(User, { as: "user", foreignKey: "userId" });
ProfilePartnerAssignment.belongsTo(Partner, { as: "buyPartner", foreignKey: "buyPartnerId" });
ProfilePartnerAssignment.belongsTo(Partner, { as: "sellPartner", foreignKey: "sellPartnerId" });
Partner.hasMany(ProfilePartnerAssignment, { as: "buyProfileAssignments", foreignKey: "buyPartnerId" });
Partner.hasMany(ProfilePartnerAssignment, { as: "sellProfileAssignments", foreignKey: "sellPartnerId" });

// API key ↔ user binding
User.hasMany(ApiKey, { as: "apiKeys", foreignKey: "userId" });
ApiKey.belongsTo(User, { as: "user", foreignKey: "userId" });

// API key ↔ partner attribution (FK replaces the partner_name string)
ApiKey.belongsTo(Partner, { as: "partner", foreignKey: "partnerId" });
Partner.hasMany(ApiKey, { as: "apiKeys", foreignKey: "partnerId" });

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
  Anchor,
  ApiClientEvent,
  ApiKey,
  CustomerEntity,
  KycCase,
  MaintenanceSchedule,
  Notification,
  NotificationPreference,
  Partner,
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
  TaxId,
  User,
  Webhook
};

// Export models and sequelize instance
export { sequelize };
export default models;

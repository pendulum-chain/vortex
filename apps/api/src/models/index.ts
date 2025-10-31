import sequelize from "../config/database";
import Anchor from "./anchor.model";
import ApiKey from "./apiKey.model";
import KycLevel2 from "./kycLevel2.model";
import MaintenanceSchedule from "./maintenanceSchedule.model";
import Partner from "./partner.model";
import QuoteTicket from "./quoteTicket.model";
import RampState from "./rampState.model";
import Subsidy from "./subsidy.model";
import TaxId from "./taxId.model";
import User from "./user.model";
import Webhook from "./webhook.model";

// Define associations
RampState.belongsTo(QuoteTicket, { as: "quote", foreignKey: "quoteId" });
QuoteTicket.hasOne(RampState, { as: "rampState", foreignKey: "quoteId" });
QuoteTicket.belongsTo(Partner, { as: "partner", foreignKey: "partnerId" });
Partner.hasMany(QuoteTicket, { as: "quotes", foreignKey: "partnerId" });
RampState.hasMany(Subsidy, { as: "subsidies", foreignKey: "rampId" });
Subsidy.belongsTo(RampState, { as: "rampState", foreignKey: "rampId" });

// User associations
User.hasMany(QuoteTicket, { as: "quoteTickets", foreignKey: "userId" });
QuoteTicket.belongsTo(User, { as: "user", foreignKey: "userId" });

User.hasMany(RampState, { as: "rampStates", foreignKey: "userId" });
RampState.belongsTo(User, { as: "user", foreignKey: "userId" });

User.hasMany(KycLevel2, { as: "kycRecords", foreignKey: "userId" });
KycLevel2.belongsTo(User, { as: "user", foreignKey: "userId" });

User.hasMany(TaxId, { as: "taxIds", foreignKey: "userId" });
TaxId.belongsTo(User, { as: "user", foreignKey: "userId" });

// Initialize models
const models = {
  Anchor,
  ApiKey,
  KycLevel2,
  MaintenanceSchedule,
  Partner,
  QuoteTicket,
  RampState,
  Subsidy,
  TaxId,
  User,
  Webhook
};

// Export models and sequelize instance
export { sequelize };
export default models;

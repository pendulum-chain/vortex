import sequelize from "../config/database";
import Anchor from "./anchor.model";
import KycLevel2 from "./kycLevel2.model";
import MaintenanceSchedule from "./maintenanceSchedule.model";
import Partner from "./partner.model";
import QuoteTicket from "./quoteTicket.model";
import RampState from "./rampState.model";
import Subsidy from "./subsidy.model";

// Define associations
RampState.belongsTo(QuoteTicket, { as: "quote", foreignKey: "quoteId" });
QuoteTicket.hasOne(RampState, { as: "rampState", foreignKey: "quoteId" });
QuoteTicket.belongsTo(Partner, { as: "partner", foreignKey: "partnerId" });
Partner.hasMany(QuoteTicket, { as: "quotes", foreignKey: "partnerId" });
RampState.hasMany(Subsidy, { as: "subsidies", foreignKey: "rampId" });
Subsidy.belongsTo(RampState, { as: "rampState", foreignKey: "rampId" });

// Initialize models
const models = {
  Anchor,
  KycLevel2,
  MaintenanceSchedule,
  Partner,
  QuoteTicket,
  RampState,
  Subsidy
};

// Export models and sequelize instance
export { sequelize };
export default models;

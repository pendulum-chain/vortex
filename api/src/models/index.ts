import sequelize from '../config/database';
import QuoteTicket from './quoteTicket.model';
import RampState from './rampState.model';
import Partner from './partner.model';
import Anchor from './anchor.model';

// Define associations
RampState.belongsTo(QuoteTicket, { foreignKey: 'quoteId', as: 'quote' });
QuoteTicket.hasOne(RampState, { foreignKey: 'quoteId', as: 'rampState' });
QuoteTicket.belongsTo(Partner, { foreignKey: 'partnerId', as: 'partner' });
Partner.hasMany(QuoteTicket, { foreignKey: 'partnerId', as: 'quotes' });

// Initialize models
const models = {
  QuoteTicket,
  RampState,
  Partner,
  Anchor,
};

// Export models and sequelize instance
export { sequelize };
export default models;

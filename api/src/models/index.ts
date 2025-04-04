import sequelize from '../config/database';
import QuoteTicket from './quoteTicket.model';
import RampState from './rampState.model';
import PhaseMetadata from './phaseMetadata.model';

// Define associations
RampState.belongsTo(QuoteTicket, { foreignKey: 'quoteId', as: 'quote' });
QuoteTicket.hasOne(RampState, { foreignKey: 'quoteId', as: 'rampState' });

// Initialize models
const models = {
  QuoteTicket,
  RampState,
  PhaseMetadata,
};

// Export models and sequelize instance
export { sequelize };
export default models;

#!/usr/bin/env node
import { v4 as uuidv4 } from 'uuid';
import PhaseMetadata from '../../models/phaseMetadata.model';
import sequelize from '../../config/database';
import logger from '../../config/logger';

// Define the phase metadata for offramping flow
const offrampPhaseMetadata = [
  {
    id: uuidv4(),
    phaseName: 'initial',
    requiredTransactions: [],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['prepareTransactions'],
  },
  {
    id: uuidv4(),
    phaseName: 'prepareTransactions',
    requiredTransactions: [],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['squidRouter', 'pendulumFundEphemeral'],
  },
  {
    id: uuidv4(),
    phaseName: 'squidRouter',
    requiredTransactions: ['squidRouterApproveHash', 'squidRouterSwapHash'],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['pendulumFundEphemeral'],
  },
  {
    id: uuidv4(),
    phaseName: 'pendulumFundEphemeral',
    requiredTransactions: [],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['executeMoonbeamToPendulumXCM', 'executeAssetHubToPendulumXCM'],
  },
  {
    id: uuidv4(),
    phaseName: 'executeMoonbeamToPendulumXCM',
    requiredTransactions: ['moonbeamXcmTransactionHash'],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['subsidizePreSwap'],
  },
  {
    id: uuidv4(),
    phaseName: 'executeAssetHubToPendulumXCM',
    requiredTransactions: ['assetHubXcmTransactionHash'],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['subsidizePreSwap'],
  },
  {
    id: uuidv4(),
    phaseName: 'subsidizePreSwap',
    requiredTransactions: [],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['nablaApprove'],
  },
  {
    id: uuidv4(),
    phaseName: 'nablaApprove',
    requiredTransactions: [],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['nablaSwap'],
  },
  {
    id: uuidv4(),
    phaseName: 'nablaSwap',
    requiredTransactions: [],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['subsidizePostSwap'],
  },
  {
    id: uuidv4(),
    phaseName: 'subsidizePostSwap',
    requiredTransactions: [],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['executePendulumToMoonbeamXCM', 'executeSpacewalkRedeem'],
  },
  {
    id: uuidv4(),
    phaseName: 'executePendulumToMoonbeamXCM',
    requiredTransactions: ['pendulumToMoonbeamXcmHash'],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['performBrlaPayoutOnMoonbeam'],
  },
  {
    id: uuidv4(),
    phaseName: 'performBrlaPayoutOnMoonbeam',
    requiredTransactions: [],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['pendulumCleanup'],
  },
  {
    id: uuidv4(),
    phaseName: 'executeSpacewalkRedeem',
    requiredTransactions: [],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['pendulumCleanup', 'stellarOfframp'],
  },
  {
    id: uuidv4(),
    phaseName: 'stellarOfframp',
    requiredTransactions: [],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['stellarCleanup'],
  },
  {
    id: uuidv4(),
    phaseName: 'stellarCleanup',
    requiredTransactions: [],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['pendulumCleanup'],
  },
  {
    id: uuidv4(),
    phaseName: 'pendulumCleanup',
    requiredTransactions: [],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['complete'],
  },
  {
    id: uuidv4(),
    phaseName: 'complete',
    requiredTransactions: [],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: [],
  },
];

// Define the phase metadata for onramping flow
const onrampPhaseMetadata = [
  {
    id: uuidv4(),
    phaseName: 'createPayInRequest',
    requiredTransactions: [],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['createMoonbeamEphemeralSeed'],
  },
  {
    id: uuidv4(),
    phaseName: 'createMoonbeamEphemeralSeed',
    requiredTransactions: [],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['executeMoonbeamToPendulumXCM'],
  },
  {
    id: uuidv4(),
    phaseName: 'executePendulumToAssetHubXCM',
    requiredTransactions: [],
    successConditions: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
    validTransitions: ['pendulumCleanup'],
  },
];

// Combine all phase metadata
const allPhaseMetadata = [...offrampPhaseMetadata, ...onrampPhaseMetadata];

// Seed the phase metadata
async function seedPhaseMetadata() {
  try {
    await sequelize.authenticate();
    logger.info('Connected to database');

    // Delete existing phase metadata
    await PhaseMetadata.destroy({ where: {} });
    logger.info('Deleted existing phase metadata');

    // Create new phase metadata
    await PhaseMetadata.bulkCreate(allPhaseMetadata);
    logger.info('Created new phase metadata');

    logger.info('Phase metadata seeding completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error seeding phase metadata:', error);
    process.exit(1);
  }
}

// Run the seeder if this file is executed directly
if (require.main === module) {
  seedPhaseMetadata();
}

export default seedPhaseMetadata;

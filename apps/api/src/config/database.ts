import { Sequelize } from 'sequelize';
import logger from './logger';
import { config } from './vars';

// Add database configuration to vars.ts
declare module './vars' {
  interface Config {
    database: {
      host: string;
      port: number;
      username: string;
      password: string;
      database: string;
      dialect: 'postgres';
      logging: boolean;
    };
  }
}

// Create Sequelize instance
const sequelize = new Sequelize(config.database.database, config.database.username, config.database.password, {
  host: config.database.host,
  port: config.database.port,
  dialect: config.database.dialect,
  logging: config.database.logging ? (msg) => logger.debug(msg) : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

// Test database connection
export const testDatabaseConnection = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    logger.info('Database connection has been established successfully.');
  } catch (error) {
    logger.error('Unable to connect to the database:', error);
    throw error;
  }
};

export default sequelize;

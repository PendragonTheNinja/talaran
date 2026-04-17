import knex from 'knex';
import dotenv from 'dotenv';
import { logger } from '../index';

dotenv.config();

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
});

db.raw('SELECT 1')
  .then(() => logger.info('Database connected successfully'))
  .catch((err) => logger.error(`Database connection failed: ${err.message}`));

export default db;
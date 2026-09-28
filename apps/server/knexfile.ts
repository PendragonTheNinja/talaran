import type { Knex } from 'knex';
import dotenv from 'dotenv';
dotenv.config();

// One connection config for the Knex CLI (migrate, seed), whatever NODE_ENV
// says, matching the running game's (src/db/index.ts: DATABASE_URL, nothing
// else). production used to add ssl: { rejectUnauthorized: false }, which the
// game never used, so the CLI and the game could connect differently (audit
// L-15). If the database ever needs SSL, say so in DATABASE_URL
// (?sslmode=require) and both follow.
const shared: Knex.Config = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  migrations: {
    directory: './src/db/migrations',
    extension: 'ts',
  },
  seeds: {
    directory: './src/db/seeds',
    extension: 'ts',
  },
};

const config: { [key: string]: Knex.Config } = {
  development: shared,
  production: shared,
};

export default config;

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Support both DATABASE_URL (standard) and individual connection parameters (local setup)
const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT) || 5432,
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  };

if (!process.env.DATABASE_URL && !process.env.DATABASE_HOST) {
  throw new Error(
    "DATABASE_URL or DATABASE_HOST must be set to connect to a database.",
  );
}

export const pool = new Pool(poolConfig);
export const db = drizzle(pool, { schema });

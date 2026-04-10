import { Pool } from "pg";

const requiredEnvKeys = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"];

for (const key of requiredEnvKeys) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

function getSslConfig() {
  const sslMode = process.env.DB_SSL?.toLowerCase();
  const shouldUseSsl =
    sslMode === "true" ||
    sslMode === "1" ||
    process.env.DB_HOST?.includes("render.com");

  if (!shouldUseSsl) {
    return undefined;
  }

  return { rejectUnauthorized: false };
}

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: getSslConfig(),
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function testDbConnection() {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT NOW() AS now");
    return result.rows[0];
  } finally {
    client.release();
  }
}


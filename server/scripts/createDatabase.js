import "dotenv/config";
import { Client } from "pg";

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

async function main() {
  const name = process.env.DB_NAME;
  if (!name) {
    throw new Error("DB_NAME is required");
  }

  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: "postgres",
    ssl: getSslConfig(),
  });

  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE ${name}`);
      console.log(`Created database: ${name}`);
    } else {
      console.log(`Database already exists: ${name}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to create database:", error.message);
  process.exit(1);
});


import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "../src/db.js";

async function run() {
  const schemaPath = resolve(process.cwd(), "sql", "001_schema.sql");
  const sql = await readFile(schemaPath, "utf8");

  try {
    await pool.query(sql);
    console.log("Migration completed: 001_schema.sql");
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});


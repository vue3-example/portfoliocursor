import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "../src/db.js";

async function run() {
  const seedPath = resolve(process.cwd(), "sql", "002_seed.sql");
  const sql = await readFile(seedPath, "utf8");

  try {
    await pool.query(sql);
    console.log("Seed completed: 002_seed.sql");
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exit(1);
});


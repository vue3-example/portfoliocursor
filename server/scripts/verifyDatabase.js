import "dotenv/config";
import { pool } from "../src/db.js";

async function run() {
  try {
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('menus', 'options', 'orders', 'order_items')
      ORDER BY table_name
    `);

    const menus = await pool.query("SELECT count(*)::int AS cnt FROM menus");
    const options = await pool.query("SELECT count(*)::int AS cnt FROM options");

    console.log("TABLES:", tables.rows.map((row) => row.table_name).join(", "));
    console.log("MENUS:", menus.rows[0].cnt);
    console.log("OPTIONS:", options.rows[0].cnt);
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("Verification failed:", error.message);
  process.exit(1);
});


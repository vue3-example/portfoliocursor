import "dotenv/config";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { pool, testDbConnection } from "./db.js";

const app = express();

// 환경 변수 또는 기본값
const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://127.0.0.1:5173";
const normalizeOrigin = (value) => String(value || "").trim().replace(/\/+$/, "");
const ALLOWED_ORIGINS = CORS_ORIGIN.split(",").map(normalizeOrigin).filter(Boolean);
const ALLOW_RENDER_DOMAINS = String(process.env.ALLOW_RENDER_DOMAINS || "true").toLowerCase() === "true";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UI_PUBLIC_DIR = path.resolve(__dirname, "../../ui/public");

async function applySqlFile(relativePath, label) {
  const filePath = path.resolve(__dirname, relativePath);
  const sql = await readFile(filePath, "utf8");
  await pool.query(sql);
  console.log(`${label} applied: ${relativePath}`);
}

async function maybeInitDatabase() {
  const autoMigrate = String(process.env.AUTO_MIGRATE ?? "").toLowerCase() === "true";
  const autoSeed = String(process.env.AUTO_SEED ?? "").toLowerCase() === "true";

  if (!autoMigrate && !autoSeed) return;

  // 스키마/시드는 idempotent(IF NOT EXISTS / ON CONFLICT)라 재시작 시에도 안전합니다.
  if (autoMigrate) {
    await applySqlFile("../sql/001_schema.sql", "Migration");
  }
  if (autoSeed) {
    await applySqlFile("../sql/002_seed.sql", "Seed");
  }
}

// CORS, JSON 파서 설정
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);
      const isExplicitlyAllowed = ALLOWED_ORIGINS.includes(normalizedOrigin);
      const isRenderDomain =
        ALLOW_RENDER_DOMAINS && /^https:\/\/[a-z0-9-]+\.onrender\.com$/i.test(normalizedOrigin);

      if (isExplicitlyAllowed || isRenderDomain) {
        callback(null, true);
        return;
      }

      callback(new Error(`Not allowed by CORS: ${normalizedOrigin}`));
    },
    credentials: false,
  }),
);
app.use(express.json());

// 정적 파일 제공
app.use(express.static(UI_PUBLIC_DIR));
app.use("/menu", express.static(path.join(UI_PUBLIC_DIR, "menu")));

// 헬스 체크
app.get("/api/health", (_, res) => {
  res.json({ status: "ok", message: "coffee-order server is running" });
});

// DB 헬스 체크
app.get("/api/health/db", async (_, res, next) => {
  try {
    const row = await testDbConnection();
    res.json({
      status: "ok",
      database: "connected",
      serverTime: row.now,
    });
  } catch (error) {
    next(error);
  }
});

const ORDER_STATUS_FLOW = ["RECEIVED", "IN_PROGRESS", "COMPLETED"];

function buildOrderSummary(items) {
  return items
    .map((item) => {
      const optionText = item.options.length > 0 ? ` (${item.options.join(", ")})` : "";
      return `${item.menuName}${optionText} x${item.quantity}`;
    })
    .join(", ");
}

async function getMenusFromDb() {
  const menusResult = await pool.query(`
    SELECT id, name, description, price, image_url, stock_quantity
    FROM menus
    ORDER BY name
  `);
  const optionsResult = await pool.query(`
    SELECT id, menu_id, name, extra_price
    FROM options
    ORDER BY menu_id, id
  `);

  const optionMap = new Map();
  for (const option of optionsResult.rows) {
    if (!optionMap.has(option.menu_id)) optionMap.set(option.menu_id, []);
    optionMap.get(option.menu_id).push({
      id: option.id,
      name: option.name,
      extraPrice: option.extra_price,
    });
  }

  return menusResult.rows.map((menu) => ({
    id: menu.id,
    name: menu.name,
    description: menu.description,
    price: menu.price,
    imageUrl: menu.image_url,
    stockQuantity: menu.stock_quantity,
    options: optionMap.get(menu.id) ?? [],
  }));
}

app.get("/api/menus", async (_, res, next) => {
  try {
    const menus = await getMenusFromDb();
    res.json({ menus });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/menus/:menuId/stock", async (req, res, next) => {
  try {
    const { menuId } = req.params;
    const delta = Number(req.body?.delta);
    if (!Number.isInteger(delta) || delta === 0) {
      return res.status(400).json({ message: "delta는 0이 아닌 정수여야 합니다." });
    }

    const result = await pool.query(
      `
      UPDATE menus
      SET stock_quantity = stock_quantity + $2, updated_at = NOW()
      WHERE id = $1
        AND stock_quantity + $2 >= 0
      RETURNING id, stock_quantity
      `,
      [menuId, delta],
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ message: "재고를 수정할 수 없습니다." });
    }

    return res.json({
      menuId: result.rows[0].id,
      stockQuantity: result.rows[0].stock_quantity,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders", async (req, res, next) => {
  const { items } = req.body ?? {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "items는 1개 이상이어야 합니다." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderItemsPayload = [];
    const qtyByMenu = new Map();

    for (const item of items) {
      const menuId = item?.menuId;
      const quantity = Number(item?.quantity);
      const optionIds = Array.isArray(item?.optionIds) ? item.optionIds : [];

      if (!menuId || !Number.isInteger(quantity) || quantity <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "주문 항목 형식이 올바르지 않습니다." });
      }

      qtyByMenu.set(menuId, (qtyByMenu.get(menuId) ?? 0) + quantity);

      const menuResult = await client.query(
        `SELECT id, name, price, stock_quantity FROM menus WHERE id = $1 FOR UPDATE`,
        [menuId],
      );
      if (menuResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: `존재하지 않는 메뉴입니다: ${menuId}` });
      }
      const menu = menuResult.rows[0];

      let options = [];
      if (optionIds.length > 0) {
        const optionResult = await client.query(
          `
          SELECT id, name, extra_price
          FROM options
          WHERE menu_id = $1 AND id = ANY($2::text[])
          `,
          [menuId, optionIds],
        );
        if (optionResult.rowCount !== optionIds.length) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: `옵션 정보가 올바르지 않습니다: ${menuId}` });
        }
        options = optionResult.rows;
      }

      const optionExtra = options.reduce((sum, opt) => sum + opt.extra_price, 0);
      const unitPrice = menu.price + optionExtra;
      const linePrice = unitPrice * quantity;

      orderItemsPayload.push({
        menuId,
        menuName: menu.name,
        quantity,
        unitPrice,
        linePrice,
        optionNames: options.map((opt) => opt.name),
      });
    }

    const shortfalls = [];
    for (const [menuId, orderQty] of qtyByMenu.entries()) {
      const stockResult = await client.query(
        `SELECT id, name, stock_quantity FROM menus WHERE id = $1 FOR UPDATE`,
        [menuId],
      );
      const menu = stockResult.rows[0];
      if (!menu || orderQty > menu.stock_quantity) {
        shortfalls.push({
          menuId,
          menuName: menu?.name ?? menuId,
          orderQty,
          available: menu?.stock_quantity ?? 0,
        });
      }
    }
    if (shortfalls.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "재고가 부족합니다.", shortfalls });
    }

    const totalPrice = orderItemsPayload.reduce((sum, row) => sum + row.linePrice, 0);
    const orderResult = await client.query(
      `
      INSERT INTO orders (status, total_price)
      VALUES ('RECEIVED', $1)
      RETURNING id, ordered_at, status, total_price
      `,
      [totalPrice],
    );
    const order = orderResult.rows[0];

    for (const row of orderItemsPayload) {
      await client.query(
        `
        INSERT INTO order_items (
          order_id, menu_id, menu_name_snapshot, unit_price, quantity, line_price, option_names_snapshot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          order.id,
          row.menuId,
          row.menuName,
          row.unitPrice,
          row.quantity,
          row.linePrice,
          row.optionNames.join(", "),
        ],
      );
    }

    for (const [menuId, qty] of qtyByMenu.entries()) {
      await client.query(
        `UPDATE menus SET stock_quantity = stock_quantity - $2, updated_at = NOW() WHERE id = $1`,
        [menuId, qty],
      );
    }

    await client.query("COMMIT");
    return res.status(201).json({
      orderId: order.id,
      orderedAt: order.ordered_at,
      status: order.status,
      totalPrice: order.total_price,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.get("/api/orders", async (req, res, next) => {
  try {
    const statusFilter = req.query.status;
    const orderResult = statusFilter
      ? await pool.query(
          `
          SELECT id, ordered_at, status, total_price
          FROM orders
          WHERE status = $1
          ORDER BY ordered_at DESC
          `,
          [statusFilter],
        )
      : await pool.query(`
          SELECT id, ordered_at, status, total_price
          FROM orders
          ORDER BY ordered_at DESC
        `);

    const itemResult = await pool.query(`
      SELECT order_id, menu_name_snapshot, quantity, option_names_snapshot
      FROM order_items
      ORDER BY id
    `);

    const byOrder = new Map();
    for (const item of itemResult.rows) {
      if (!byOrder.has(item.order_id)) byOrder.set(item.order_id, []);
      const options = item.option_names_snapshot
        ? item.option_names_snapshot.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      byOrder.get(item.order_id).push({
        menuName: item.menu_name_snapshot,
        quantity: item.quantity,
        options,
      });
    }

    const orders = orderResult.rows.map((order) => {
      const lineItems = byOrder.get(order.id) ?? [];
      const summary = buildOrderSummary(
        lineItems.map((line) => ({
          menuName: line.menuName,
          quantity: line.quantity,
          options: line.options,
        })),
      );
      return {
        id: order.id,
        orderedAt: order.ordered_at,
        status: order.status,
        totalPrice: order.total_price,
        summary,
      };
    });

    res.json({ orders });
  } catch (error) {
    next(error);
  }
});

app.get("/api/orders/:orderId", async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId)) {
      return res.status(400).json({ message: "orderId는 숫자여야 합니다." });
    }

    const orderResult = await pool.query(
      `SELECT id, ordered_at, status, total_price FROM orders WHERE id = $1`,
      [orderId],
    );
    if (orderResult.rowCount === 0) {
      return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
    }

    const itemsResult = await pool.query(
      `
      SELECT menu_id, menu_name_snapshot, quantity, unit_price, line_price, option_names_snapshot
      FROM order_items
      WHERE order_id = $1
      ORDER BY id
      `,
      [orderId],
    );

    const order = orderResult.rows[0];
    const items = itemsResult.rows.map((item) => ({
      menuId: item.menu_id,
      menuName: item.menu_name_snapshot,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      linePrice: item.line_price,
      options: item.option_names_snapshot
        ? item.option_names_snapshot.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
    }));

    res.json({
      id: order.id,
      orderedAt: order.ordered_at,
      status: order.status,
      totalPrice: order.total_price,
      items,
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/orders/:orderId/status", async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);
    const { nextStatus } = req.body ?? {};
    if (!Number.isInteger(orderId) || !nextStatus) {
      return res.status(400).json({ message: "orderId와 nextStatus를 확인해 주세요." });
    }

    const orderResult = await pool.query(`SELECT id, status FROM orders WHERE id = $1`, [orderId]);
    if (orderResult.rowCount === 0) {
      return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
    }

    const currentStatus = orderResult.rows[0].status;
    const currentIndex = ORDER_STATUS_FLOW.indexOf(currentStatus);
    const nextIndex = ORDER_STATUS_FLOW.indexOf(nextStatus);
    if (currentIndex === -1 || nextIndex !== currentIndex + 1) {
      return res.status(400).json({ message: "허용되지 않는 상태 변경입니다." });
    }

    const updateResult = await pool.query(
      `
      UPDATE orders
      SET status = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING id, status
      `,
      [orderId, nextStatus],
    );

    res.json({
      orderId: updateResult.rows[0].id,
      status: updateResult.rows[0].status,
    });
  } catch (error) {
    next(error);
  }
});

// 에러 핸들링
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ message: "서버 오류가 발생했습니다." });
});

// 서버 실행
app.listen(PORT, async () => {
  try {
    await testDbConnection();
    console.log("PostgreSQL connection established.");
    await maybeInitDatabase();
  } catch (error) {
    console.error("PostgreSQL connection failed:", error.message);
  }
  console.log(`Server listening on http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});

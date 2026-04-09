import "dotenv/config";
import express from "express";
import cors from "cors";
import { pool, testDbConnection } from "./db.js";

const app = express();

// 환경 변수 또는 기본값
const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://127.0.0.1:5173";

// CORS, JSON 파서 설정
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: false,
  }),
);
app.use(express.json());

// 정적 파일 제공
app.use("/menu", express.static("public/menu"));

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

// 임시 메뉴 조회(추후 DB 연동 시 교체)
app.get("/api/menus", (_, res) => {
  const menus = [
    {
      id: "americano-ice",
      name: "아메리카노(ICE)",
      description: "시원하고 깔끔한 맛의 기본 커피",
      price: 4000,
      imageUrl: "/menu/americano-ice.jpg",
      stockQuantity: 12,
      options: [
        { id: "shot", name: "샷 추가", extraPrice: 500 },
        { id: "syrup", name: "시럽 추가", extraPrice: 0 },
      ],
    },
  ];

  res.json({ menus });
});

// 에러 핸들링
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// 서버 실행
app.listen(PORT, async () => {
  try {
    await testDbConnection();
    console.log("PostgreSQL connection established.");
  } catch (error) {
    console.error("PostgreSQL connection failed:", error.message);
  }
  console.log(`Server listening on http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});

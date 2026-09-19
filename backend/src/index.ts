import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { migrate, getDb } from "./db/index.js";
import { seed } from "./db/seed.js";
import { authRouter } from "./routes/auth.js";
import { challengeRouter } from "./routes/challenges.js";
import { clusterRouter } from "./routes/clusters.js";
import { projectRouter } from "./routes/projects.js";
import { adminRouter, catalogRouter } from "./routes/admin.js";
import { publicRouter } from "./routes/public.js";
import { errorHandler } from "./middleware/error.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"], credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.get("/api/health", async (_req, res) => {
  const db = await getDb();
  res.json({
    ok: true,
    engine: db.engine,
    demo: process.env.DEMO_ENV !== "false",
    product: "CivicForge — Jharkhand",
  });
});

app.use("/api/auth", authRouter);
app.use("/api/public", publicRouter);
app.use("/api/challenges", challengeRouter);
app.use("/api/clusters", clusterRouter);
app.use("/api/projects", projectRouter);
app.use("/api/admin", adminRouter);
app.use("/api", catalogRouter);

app.use(errorHandler);

async function main() {
  await migrate();
  await seed();
  app.listen(PORT, () => {
    console.log(`CivicForge API on http://localhost:${PORT} (demo environment)`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

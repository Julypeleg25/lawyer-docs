import cors from "cors";
import express from "express";
import { pinoHttp } from "pino-http";
import { errorHandler } from "./http.js";
import { logger } from "./logger.js";
import { router } from "./routes.js";
export const app = express();
app.use(pinoHttp({ logger })); app.use(cors()); app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => res.json({ status: "ok" })); app.use("/api", router); app.use(errorHandler);

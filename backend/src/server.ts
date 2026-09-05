import "dotenv/config";
import mongoose from "mongoose";
import { app } from "./app.js";
import { config } from "./config.js";
import { ensureKnownFields } from "./fields/field.service.js";
import { logger } from "./logger.js";
import { scanTemplates } from "./templates/template-scanner.js";

async function main() {
  await mongoose.connect(config.MONGODB_URI); await ensureKnownFields(); await scanTemplates();
  app.listen(config.PORT, () => logger.info({ port: config.PORT }, "server listening"));
}
main().catch((error) => { logger.fatal({ error }, "server startup failed"); process.exitCode = 1; });

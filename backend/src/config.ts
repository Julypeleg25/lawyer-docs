import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const schema = z.object({
  MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017/lawyer-docs"),
  TEMPLATES_DIRECTORY: z.string().default("../templates"),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});
const values = schema.parse(process.env);
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../");
export const config = { ...values, templatesDirectory: path.resolve(backendRoot, values.TEMPLATES_DIRECTORY) };

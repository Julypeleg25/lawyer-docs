import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { resolveTemplateFields } from "../fields/field.service.js";
import { parseDocx } from "./docx-parser.js";
import { templateRegistry } from "./template-registry.js";
import type { TemplateDefinition } from "../types.js";

function templateId(filename: string) { return createHash("sha256").update(filename.normalize("NFC")).digest("hex").slice(0, 16); }
export async function scanTemplates() {
  let filenames: string[] = [];
  try { filenames = (await readdir(config.templatesDirectory)).filter((name) => name.toLowerCase().endsWith(".docx") && !name.startsWith("~$")); }
  catch (error: any) { if (error.code !== "ENOENT") throw error; }
  const templates: TemplateDefinition[] = [];
  for (const filename of filenames) {
    const absolutePath = path.resolve(config.templatesDirectory, filename);
    if (path.dirname(absolutePath) !== path.resolve(config.templatesDirectory)) continue;
    try {
      const buffer = await readFile(absolutePath); const parsed = parseDocx(buffer); await resolveTemplateFields(parsed.fields);
      const unclassified = parsed.fields.filter((field) => !field.classified).map((field) => field.label);
      const errors = [...parsed.errors, ...unclassified.map((label) => `נדרש סיווג לשדה: ${label}`)];
      templates.push({ id: templateId(filename), filename, displayName: path.basename(filename, path.extname(filename)).replace(/[-_]+/g, " "), hash: createHash("sha256").update(buffer).digest("hex"), absolutePath, fields: parsed.fields, repeatSections: parsed.repeatSections, valid: errors.length === 0, errors });
    } catch (error) { logger.error({ filename, error }, "template parsing failed"); templates.push({ id: templateId(filename), filename, displayName: path.basename(filename, ".docx"), hash: "", absolutePath, fields: [], repeatSections: [], valid: false, errors: ["לא ניתן לקרוא את קובץ התבנית"] }); }
  }
  templateRegistry.replace(templates); logger.info({ templates: templates.length }, "template scan completed"); return templates;
}

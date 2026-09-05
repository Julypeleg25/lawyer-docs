import { AppError } from "../http.js";
import type { TemplateDefinition } from "../types.js";
export function validateValues(templates: TemplateDefinition[], values: Record<string, unknown>) {
  const missing = new Map<string, { key: string; label: string; requiredByTemplateIds: string[] }>();
  for (const template of templates) for (const field of template.fields) if (field.required && (values[field.key!] === undefined || values[field.key!] === null || values[field.key!] === "")) {
    const item = missing.get(field.key!); if (item) item.requiredByTemplateIds.push(template.id); else missing.set(field.key!, { key: field.key!, label: field.label, requiredByTemplateIds: [template.id] });
  }
  if (missing.size) throw new AppError(422, "MISSING_FIELDS", { fields: [...missing.values()] });
}

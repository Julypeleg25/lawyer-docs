import { FieldDefinitionModel } from "../database/models.js";
import { AppError } from "../http.js";
import { templateRegistry } from "../templates/template-registry.js";
import type { FieldScope } from "../types.js";

export async function getRequirements(templateIds: string[]) {
  const templates = templateIds.map((id) => templateRegistry.get(id));
  if (templates.some((item) => !item)) throw new AppError(409, "TEMPLATE_CHANGED");
  const invalid = templates.find((item) => !item!.valid); if (invalid) throw new AppError(422, "TEMPLATE_INVALID", invalid);
  const definitions = await FieldDefinitionModel.find({ key: { $in: templates.flatMap((item) => item!.fields.map((field) => field.key)) } }).lean();
  const map = new Map<string, any>();
  for (const template of templates) for (const field of template!.fields) {
    const definition = definitions.find((item) => item.key === field.key); if (!definition?.scope) throw new AppError(422, "UNCLASSIFIED_FIELD", { label: field.label });
    const existing = map.get(field.key!); if (existing) { existing.required ||= field.required; existing.requiredByTemplateIds.push(template!.id); }
    else map.set(field.key!, { fieldDefinitionId: String(definition._id), key: field.key, label: definition.label, type: definition.type, scope: definition.scope, required: field.required, requiredByTemplateIds: [template!.id] });
  }
  const grouped = (scope: FieldScope) => [...map.values()].filter((item) => item.scope === scope);
  return { personFields: grouped("person"), propertyFields: grouped("property"), transactionFields: grouped("transaction") };
}

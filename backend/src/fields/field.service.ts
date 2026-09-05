import { createHash } from "node:crypto";
import { FieldDefinitionModel } from "../database/models.js";
import type { FieldScope, FieldType, TemplateFieldRequirement } from "../types.js";

const known: Array<{ key: string; label: string; aliases: string[]; scope: FieldScope; type: FieldType; searchable?: boolean }> = [
  { key: "firstName", label: "שם פרטי", aliases: ["שם פרטי", "שם פרטי קונה", "שם פרטי מוכר"], scope: "person", type: "text", searchable: true },
  { key: "lastName", label: "שם משפחה", aliases: ["שם משפחה", "שם משפחה קונה", "שם משפחה מוכר"], scope: "person", type: "text", searchable: true },
  { key: "idNumber", label: "תעודת זהות", aliases: ["תעודת זהות", "ת\"ז", "תז", "ת.ז", "מספר תעודת זהות", "תז קונה", "תז מוכר"], scope: "person", type: "idNumber", searchable: true },
  { key: "propertyAddress", label: "כתובת הנכס", aliases: ["כתובת הנכס"], scope: "property", type: "address", searchable: true },
  { key: "block", label: "גוש", aliases: ["גוש"], scope: "property", type: "text", searchable: true },
  { key: "parcel", label: "חלקה", aliases: ["חלקה"], scope: "property", type: "text", searchable: true },
  { key: "subParcel", label: "תת חלקה", aliases: ["תת חלקה"], scope: "property", type: "text" },
  { key: "signingDate", label: "יום החתימה", aliases: ["יום החתימה"], scope: "transaction", type: "date" }
];

export function normalizeLabel(value: string) { return value.trim().replace(/\s+/g, " ").replace(/[׳״]/g, '"'); }
function fallbackKey(label: string) { return `field_${createHash("sha256").update(normalizeLabel(label)).digest("hex").slice(0, 12)}`; }

export async function ensureKnownFields() {
  for (const item of known) await FieldDefinitionModel.updateOne({ key: item.key }, { $setOnInsert: { ...item, classified: true, searchable: item.searchable ?? false, filterable: false } }, { upsert: true });
}

export async function resolveTemplateFields(fields: TemplateFieldRequirement[]) {
  const definitions = await FieldDefinitionModel.find().lean();
  for (const field of fields) {
    const normalized = normalizeLabel(field.label);
    let definition = definitions.find((item) => [item.label, ...(item.aliases ?? [])].some((alias) => normalizeLabel(alias) === normalized));
    if (!definition) {
      definition = (await FieldDefinitionModel.create({ key: fallbackKey(normalized), label: normalized, aliases: [normalized], type: "text", classified: false })).toObject();
      definitions.push(definition);
    }
    field.key = definition.key; field.scope = definition.scope ?? undefined; field.type = definition.type; field.classified = definition.classified;
  }
}

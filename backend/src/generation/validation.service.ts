import { AppError } from "../http.js";
import type { TemplateDefinition } from "../types.js";

export function validatePartyCounts(
  templates: TemplateDefinition[],
  buyerCount: number,
  sellerCount: number,
): void {
  for (const template of templates) {
    const checks = [
      {
        count: buyerCount,
        fieldRole: "buyer",
        repeatRole: "buyers",
        label: "קונים",
      },
      {
        count: sellerCount,
        fieldRole: "seller",
        repeatRole: "sellers",
        label: "מוכרים",
      },
    ] as const;
    for (const check of checks) {
      const usesRole = template.fields.some((field) => field.partyRole === check.fieldRole);
      const supportsRepeat = template.repeatSections.some(
        (section) => section.role === check.repeatRole,
      );
      if (check.count > 1 && usesRole && !supportsRepeat) {
        throw new AppError(422, "MULTIPLE_PARTIES_REQUIRE_REPEAT_SECTION", {
          templateId: template.id,
          templateName: template.displayName,
          role: check.repeatRole,
          roleLabel: check.label,
        });
      }
    }
  }
}

export function validateValues(
  templates: TemplateDefinition[],
  values: Record<string, unknown>,
): void {
  const missing = new Map<
    string,
    { key: string; label: string; requiredByTemplateIds: string[] }
  >();
  for (const template of templates)
    for (const field of template.fields)
      if (
        field.required &&
        (values[field.key!] === undefined ||
          values[field.key!] === null ||
          values[field.key!] === "")
      ) {
        const item = missing.get(field.key!);
        if (item) item.requiredByTemplateIds.push(template.id);
        else
          missing.set(field.key!, {
            key: field.key!,
            label: field.label,
            requiredByTemplateIds: [template.id],
          });
      }
  if (missing.size) throw new AppError(422, "MISSING_FIELDS", { fields: [...missing.values()] });
}

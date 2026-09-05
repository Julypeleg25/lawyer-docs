import { FieldDefinitionModel } from "../database/models.js";
import { AppError } from "../http.js";
import { templateRegistry } from "../templates/template-registry.js";
import type {
  FieldRequirement,
  FieldScope,
  GenerationRequirements,
  TemplateDefinition,
} from "../types.js";

function getTemplates(templateIds: string[]): TemplateDefinition[] {
  return templateIds.map((id) => {
    const template = templateRegistry.get(id);
    if (!template) {
      throw new AppError(409, "TEMPLATE_CHANGED");
    }
    return template;
  });
}

function mergeRequirement(
  requirements: Map<string, FieldRequirement>,
  requirement: FieldRequirement,
): void {
  const existing = requirements.get(requirement.key);
  if (!existing) {
    requirements.set(requirement.key, { ...requirement });
    return;
  }
  existing.required = existing.required || requirement.required;
  for (const templateId of requirement.requiredByTemplateIds) {
    if (!existing.requiredByTemplateIds.includes(templateId)) {
      existing.requiredByTemplateIds.push(templateId);
    }
  }
}

export async function getRequirements(templateIds: string[]): Promise<GenerationRequirements> {
  const templates = getTemplates(templateIds);
  const invalidTemplate = templates.find((template) => !template.valid);
  if (invalidTemplate) {
    throw new AppError(422, "TEMPLATE_INVALID", invalidTemplate);
  }

  const fieldKeys = templates.flatMap((template) =>
    template.fields.flatMap((field) => (field.key ? [field.key] : [])),
  );
  const definitions = await FieldDefinitionModel.find({ key: { $in: fieldKeys } }).lean();
  const requirementsByKey = new Map<string, FieldRequirement>();
  const buyerRequirementsByKey = new Map<string, FieldRequirement>();
  const sellerRequirementsByKey = new Map<string, FieldRequirement>();

  for (const template of templates) {
    for (const field of template.fields) {
      if (!field.key) {
        throw new AppError(422, "UNCLASSIFIED_FIELD", { label: field.label });
      }
      const definition = definitions.find((item) => item.key === field.key);
      if (!definition?.scope) {
        throw new AppError(422, "UNCLASSIFIED_FIELD", { label: field.label });
      }

      const requirement: FieldRequirement = {
        fieldDefinitionId: definition._id.toString(),
        key: field.key,
        label: definition.label,
        type: definition.type,
        scope: definition.scope,
        required: field.required,
        requiredByTemplateIds: [template.id],
      };
      mergeRequirement(requirementsByKey, requirement);
      if (definition.scope === "person") {
        if (field.partyRole !== "seller") {
          mergeRequirement(buyerRequirementsByKey, requirement);
        }
        if (field.partyRole !== "buyer") {
          mergeRequirement(sellerRequirementsByKey, requirement);
        }
      }
    }
  }

  const grouped = (scope: FieldScope): FieldRequirement[] =>
    [...requirementsByKey.values()].filter((requirement) => requirement.scope === scope);

  return {
    personFields: grouped("person"),
    buyerFields: [...buyerRequirementsByKey.values()],
    sellerFields: [...sellerRequirementsByKey.values()],
    propertyFields: grouped("property"),
    transactionFields: grouped("transaction"),
  };
}

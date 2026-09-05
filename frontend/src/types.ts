import { z } from "zod";

export const fieldTypeSchema = z.enum([
  "text",
  "textarea",
  "number",
  "date",
  "boolean",
  "select",
  "money",
  "percentage",
  "idNumber",
  "address",
]);

export const fieldRequirementSchema = z.object({
  fieldDefinitionId: z.string(),
  key: z.string(),
  label: z.string(),
  type: fieldTypeSchema,
  required: z.boolean(),
  requiredByTemplateIds: z.array(z.string()),
});

export const requirementsSchema = z.object({
  personFields: z.array(fieldRequirementSchema),
  buyerFields: z.array(fieldRequirementSchema),
  sellerFields: z.array(fieldRequirementSchema),
  propertyFields: z.array(fieldRequirementSchema),
  transactionFields: z.array(fieldRequirementSchema),
});

export const templateSchema = z.object({
  id: z.string(),
  filename: z.string(),
  displayName: z.string(),
  hash: z.string(),
  fields: z.array(
    z.object({
      key: z.string().optional(),
      label: z.string(),
    }),
  ),
  valid: z.boolean(),
  errors: z.array(z.string()),
});

export const fieldDefinitionSchema = z.object({
  _id: z.string(),
  key: z.string(),
  label: z.string(),
  scope: z.enum(["person", "property", "transaction"]).optional(),
  type: fieldTypeSchema,
  aliases: z.array(z.string()),
  searchable: z.boolean(),
  filterable: z.boolean(),
  classified: z.boolean(),
});

export const entitySchema = z.object({
  _id: z.string(),
  displayName: z.string(),
  idNumber: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  fields: z.record(z.string(), z.unknown()),
});

export type FieldType = z.infer<typeof fieldTypeSchema>;
export type FieldRequirement = z.infer<typeof fieldRequirementSchema>;
export type Requirements = z.infer<typeof requirementsSchema>;
export type Template = z.infer<typeof templateSchema>;
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;
export type Entity = z.infer<typeof entitySchema>;

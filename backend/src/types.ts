export const fieldScopes = ["person", "property", "transaction"] as const;
export const fieldTypes = [
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
] as const;
export type FieldScope = (typeof fieldScopes)[number];
export type FieldType = (typeof fieldTypes)[number];
export type PartyRole = "buyer" | "seller";
export type DynamicValues = Record<string, unknown>;

export interface FieldDefinition {
  key: string;
  label: string;
  scope?: FieldScope;
  type: FieldType;
  aliases: string[];
  searchable: boolean;
  filterable: boolean;
  classified: boolean;
}

export interface Customer {
  displayName: string;
  idNumber?: string;
  phone?: string;
  email?: string;
  fields: DynamicValues;
}

export interface Property {
  displayName: string;
  address?: string;
  fields: DynamicValues;
}

export interface DocumentSet {
  name: string;
  templateIds: string[];
}

export interface ParsedInstruction {
  required: boolean;
  prefix?: string;
  suffix?: string;
}
export interface TemplateFieldRequirement extends ParsedInstruction {
  raw: string;
  label: string;
  key?: string;
  scope?: FieldScope;
  type?: FieldType;
  classified: boolean;
  partyRole?: PartyRole;
}
export interface RepeatSection {
  role: "buyers" | "sellers";
  start: string;
  end: string;
}
export interface TemplateDefinition {
  id: string;
  filename: string;
  displayName: string;
  hash: string;
  absolutePath: string;
  fields: TemplateFieldRequirement[];
  repeatSections: RepeatSection[];
  valid: boolean;
  errors: string[];
}

export interface FieldRequirement {
  fieldDefinitionId: string;
  key: string;
  label: string;
  type: FieldType;
  scope: FieldScope;
  required: boolean;
  requiredByTemplateIds: string[];
}

export interface GenerationRequirements {
  personFields: FieldRequirement[];
  buyerFields: FieldRequirement[];
  sellerFields: FieldRequirement[];
  propertyFields: FieldRequirement[];
  transactionFields: FieldRequirement[];
}

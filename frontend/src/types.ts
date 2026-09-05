export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "boolean"
  | "select"
  | "money"
  | "percentage"
  | "idNumber"
  | "address";
export interface FieldRequirement {
  fieldDefinitionId: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  requiredByTemplateIds: string[];
}
export interface Requirements {
  personFields: FieldRequirement[];
  propertyFields: FieldRequirement[];
  transactionFields: FieldRequirement[];
}
export interface Template {
  id: string;
  filename: string;
  displayName: string;
  hash: string;
  fields: unknown[];
  valid: boolean;
  errors: string[];
}
export interface FieldDefinition {
  _id: string;
  key: string;
  label: string;
  scope?: "person" | "property" | "transaction";
  type: FieldType;
  aliases: string[];
  searchable: boolean;
  filterable: boolean;
  classified: boolean;
}

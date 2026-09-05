export const fieldScopes = ["person", "property", "transaction"] as const;
export const fieldTypes = ["text", "textarea", "number", "date", "boolean", "select", "money", "percentage", "idNumber", "address"] as const;
export type FieldScope = typeof fieldScopes[number];
export type FieldType = typeof fieldTypes[number];

export interface ParsedInstruction { required: boolean; prefix?: string; suffix?: string }
export interface TemplateFieldRequirement extends ParsedInstruction {
  raw: string; label: string; key?: string; scope?: FieldScope; type?: FieldType; classified: boolean;
}
export interface RepeatSection { role: "buyers" | "sellers"; start: string; end: string }
export interface TemplateDefinition {
  id: string; filename: string; displayName: string; hash: string; absolutePath: string;
  fields: TemplateFieldRequirement[]; repeatSections: RepeatSection[]; valid: boolean; errors: string[];
}

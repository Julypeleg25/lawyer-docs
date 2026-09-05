import type { TemplateDefinition } from "../types.js";
class Registry {
  private templates = new Map<string, TemplateDefinition>();
  replace(items: TemplateDefinition[]) { this.templates = new Map(items.map((item) => [item.id, item])); }
  list() { return [...this.templates.values()]; }
  get(id: string) { return this.templates.get(id); }
}
export const templateRegistry = new Registry();

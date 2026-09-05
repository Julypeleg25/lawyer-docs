import type { TemplateDefinition } from "../types.js";
class Registry {
  private templates = new Map<string, TemplateDefinition>();
  replace(items: TemplateDefinition[]): void {
    this.templates = new Map(items.map((item) => [item.id, item]));
  }
  list(): TemplateDefinition[] {
    return [...this.templates.values()];
  }
  get(id: string): TemplateDefinition | undefined {
    return this.templates.get(id);
  }
}
export const templateRegistry = new Registry();

import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import PizZip from "pizzip";
import { getContentPartNames, paragraphText } from "../templates/docx-parser.js";
import type { DynamicValues, PartyRole, TemplateDefinition } from "../types.js";

const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
type PartyValueSources = Partial<Record<PartyRole, DynamicValues>>;

function formatReplacement(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new TypeError("Document field values must be strings, numbers, booleans, or null");
}

function replaceTemplateFields(
  text: string,
  values: DynamicValues,
  template: TemplateDefinition,
  partyValues: PartyValueSources,
  currentPartyRole?: PartyRole,
): string {
  let output = text;
  for (const field of template.fields) {
    const sourceRole = field.partyRole ?? (field.scope === "person" ? currentPartyRole : undefined);
    const source = sourceRole ? (partyValues[sourceRole] ?? {}) : values;
    const value = formatReplacement(field.key ? source[field.key] : undefined);
    const rendered = value ? `${field.prefix ?? ""}${value}${field.suffix ?? ""}` : "";
    output = output.split(field.raw).join(rendered);
  }
  return output;
}

function replaceAcrossRuns(
  doc: Document,
  values: DynamicValues,
  template: TemplateDefinition,
  partyValues: PartyValueSources,
): void {
  const paragraphs = doc.getElementsByTagNameNS(ns, "p");
  for (let index = 0; index < paragraphs.length; index++) {
    const paragraph = paragraphs.item(index)!;
    const text = paragraphText(paragraph);
    if (!text.includes("X")) continue;
    let output = replaceTemplateFields(text, values, template, partyValues);
    output = output.replace(/X#(?:קונים|מוכרים)X|X\/(?:קונים|מוכרים)X/gu, "");
    const nodes = paragraph.getElementsByTagNameNS(ns, "t");
    if (!nodes.length) continue;
    nodes.item(0)!.textContent = output;
    for (let nodeIndex = 1; nodeIndex < nodes.length; nodeIndex++)
      nodes.item(nodeIndex)!.textContent = "";
  }
}
function replaceInNode(
  node: Node,
  values: DynamicValues,
  template: TemplateDefinition,
  partyValues: PartyValueSources,
  currentPartyRole: PartyRole,
): void {
  const paragraphs =
    node.nodeType === 1 && (node as Element).localName === "p"
      ? [node as Element]
      : node.nodeType === 1
        ? Array.from((node as Element).getElementsByTagNameNS(ns, "p"))
        : [];
  for (const paragraph of paragraphs) {
    const output = replaceTemplateFields(
      paragraphText(paragraph),
      values,
      template,
      partyValues,
      currentPartyRole,
    );
    const nodes = paragraph.getElementsByTagNameNS(ns, "t");
    if (nodes.length) {
      nodes.item(0)!.textContent = output;
      for (let index = 1; index < nodes.length; index++) nodes.item(index)!.textContent = "";
    }
  }
}
function expandRepeatSection(
  doc: Document,
  start: string,
  end: string,
  role: PartyRole,
  parties: DynamicValues[],
  values: DynamicValues,
  template: TemplateDefinition,
  partyValues: PartyValueSources,
): void {
  const paragraphs = Array.from(doc.getElementsByTagNameNS(ns, "p"));
  const startParagraph = paragraphs.find((item) => paragraphText(item).includes(start));
  const endParagraph = paragraphs.find((item) => paragraphText(item).includes(end));
  if (!startParagraph || !endParagraph) return;
  const parent = startParagraph.parentNode;
  if (!parent || parent !== endParagraph.parentNode) return;
  const children = Array.from(parent.childNodes);
  const startIndex = children.indexOf(startParagraph);
  const endIndex = children.indexOf(endParagraph);
  if (endIndex <= startIndex) return;
  const region = children.slice(startIndex + 1, endIndex);
  for (const party of parties)
    for (const original of region) {
      const clone = original.cloneNode(true);
      replaceInNode(clone, values, template, { ...partyValues, [role]: party }, role);
      parent.insertBefore(clone, endParagraph);
    }
  for (const original of region) parent.removeChild(original);
  parent.removeChild(startParagraph);
  parent.removeChild(endParagraph);
}
export function generateDocument(input: {
  templateBuffer: Buffer;
  templateDefinition: TemplateDefinition;
  values: Record<string, unknown>;
  buyers?: Record<string, unknown>[];
  sellers?: Record<string, unknown>[];
}): Buffer {
  const zip = new PizZip(input.templateBuffer);
  const partyValues: PartyValueSources = {
    ...(input.buyers?.[0] ? { buyer: input.buyers[0] } : {}),
    ...(input.sellers?.[0] ? { seller: input.sellers[0] } : {}),
  };
  for (const name of getContentPartNames(zip)) {
    const file = zip.file(name);
    if (!file) continue;
    const doc = new DOMParser().parseFromString(file.asText(), "application/xml");
    expandRepeatSection(
      doc,
      "X#קוניםX",
      "X/קוניםX",
      "buyer",
      input.buyers ?? [],
      input.values,
      input.templateDefinition,
      partyValues,
    );
    expandRepeatSection(
      doc,
      "X#מוכריםX",
      "X/מוכריםX",
      "seller",
      input.sellers ?? [],
      input.values,
      input.templateDefinition,
      partyValues,
    );
    replaceAcrossRuns(doc, input.values, input.templateDefinition, partyValues);
    zip.file(name, new XMLSerializer().serializeToString(doc));
  }
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

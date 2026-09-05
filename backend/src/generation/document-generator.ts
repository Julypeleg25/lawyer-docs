import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import PizZip from "pizzip";
import { getContentPartNames, paragraphText } from "../templates/docx-parser.js";
import type { TemplateDefinition } from "../types.js";

const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
function escapeReplacement(value: unknown) { return value == null ? "" : String(value); }
function replaceAcrossRuns(doc: Document, values: Record<string, unknown>, template: TemplateDefinition) {
  const paragraphs = doc.getElementsByTagNameNS(ns, "p");
  for (let index = 0; index < paragraphs.length; index++) {
    const paragraph = paragraphs.item(index)!; const text = paragraphText(paragraph); if (!text.includes("X")) continue;
    let output = text;
    for (const field of template.fields) {
      const value = escapeReplacement(values[field.key!]); const rendered = value ? `${field.prefix ?? ""}${value}${field.suffix ?? ""}` : "";
      output = output.split(field.raw).join(rendered);
    }
    output = output.replace(/X#(?:קונים|מוכרים)X|X\/(?:קונים|מוכרים)X/gu, "");
    const nodes = paragraph.getElementsByTagNameNS(ns, "t"); if (!nodes.length) continue;
    nodes.item(0)!.textContent = output; for (let nodeIndex = 1; nodeIndex < nodes.length; nodeIndex++) nodes.item(nodeIndex)!.textContent = "";
  }
}
function replaceInNode(node: Node, values: Record<string, unknown>, template: TemplateDefinition) {
  const paragraphs = node.nodeType === 1 && (node as Element).localName === "p" ? [node as Element] : Array.from((node as Element).getElementsByTagNameNS?.(ns, "p") ?? []);
  for (const paragraph of paragraphs) {
    let output = paragraphText(paragraph);
    for (const field of template.fields) { const value = escapeReplacement(values[field.key!]); const rendered = value ? `${field.prefix ?? ""}${value}${field.suffix ?? ""}` : ""; output = output.split(field.raw).join(rendered); }
    const nodes = paragraph.getElementsByTagNameNS(ns, "t"); if (nodes.length) { nodes.item(0)!.textContent = output; for (let index = 1; index < nodes.length; index++) nodes.item(index)!.textContent = ""; }
  }
}
function expandRepeatSection(doc: Document, start: string, end: string, parties: Record<string, unknown>[], template: TemplateDefinition) {
  const paragraphs = Array.from(doc.getElementsByTagNameNS(ns, "p")); const startParagraph = paragraphs.find((item) => paragraphText(item).includes(start)); const endParagraph = paragraphs.find((item) => paragraphText(item).includes(end));
  if (!startParagraph || !endParagraph || startParagraph.parentNode !== endParagraph.parentNode) return;
  const parent = startParagraph.parentNode!; const children = Array.from(parent.childNodes); const startIndex = children.indexOf(startParagraph); const endIndex = children.indexOf(endParagraph); if (endIndex <= startIndex) return;
  const region = children.slice(startIndex + 1, endIndex);
  for (const party of parties) for (const original of region) { const clone = original.cloneNode(true); replaceInNode(clone, party, template); parent.insertBefore(clone, endParagraph); }
  for (const original of region) parent.removeChild(original); parent.removeChild(startParagraph); parent.removeChild(endParagraph);
}
export function generateDocument(input: { templateBuffer: Buffer; templateDefinition: TemplateDefinition; values: Record<string, unknown>; buyers?: Record<string, unknown>[]; sellers?: Record<string, unknown>[] }) {
  const zip = new PizZip(input.templateBuffer);
  for (const name of getContentPartNames(zip)) { const file = zip.file(name); if (!file) continue; const doc = new DOMParser().parseFromString(file.asText(), "application/xml"); expandRepeatSection(doc, "X#קוניםX", "X/קוניםX", input.buyers ?? [], input.templateDefinition); expandRepeatSection(doc, "X#מוכריםX", "X/מוכריםX", input.sellers ?? [], input.templateDefinition); replaceAcrossRuns(doc, input.values, input.templateDefinition); zip.file(name, new XMLSerializer().serializeToString(doc)); }
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

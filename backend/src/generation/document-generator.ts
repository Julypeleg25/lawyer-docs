import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import PizZip from "pizzip";
import {
  getContentPartNames,
  paragraphPartyRole,
  paragraphText,
} from "../templates/docx-parser.js";
import {
  formatPlaceholder,
  PLACEHOLDER_DELIMITER,
  PLACEHOLDER_PATTERN,
} from "../templates/placeholder-syntax.js";
import { resolveRepeatBoundary } from "../templates/repeat-boundary.js";
import type { DynamicValues, PartyRole, TemplateDefinition } from "../types.js";

const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const xmlNamespace = "http://www.w3.org/XML/1998/namespace";
type PartyValueSources = Partial<Record<PartyRole, DynamicValues>>;
interface TextNodeRange {
  node: Element;
  start: number;
  end: number;
}
interface TextReplacement {
  start: number;
  end: number;
  value: string;
}

function formatReplacement(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new TypeError("Document field values must be strings, numbers, booleans, or null");
}

function renderTemplateField(
  raw: string,
  values: DynamicValues,
  template: TemplateDefinition,
  partyValues: PartyValueSources,
  currentPartyRole?: PartyRole,
): string | undefined {
  if (
    raw === formatPlaceholder("#קונים") ||
    raw === formatPlaceholder("/קונים") ||
    raw === formatPlaceholder("#מוכרים") ||
    raw === formatPlaceholder("/מוכרים")
  )
    return "";
  const candidates = template.fields.filter((candidate) => candidate.raw === raw);
  const field = currentPartyRole
    ? (candidates.find((candidate) => candidate.partyRole === currentPartyRole) ??
      candidates.find((candidate) => !candidate.partyRole) ??
      candidates[0])
    : (candidates.find((candidate) => !candidate.partyRole) ?? candidates[0]);
  if (!field) return undefined;
  const sourceRole = field.partyRole ?? (field.scope === "person" ? currentPartyRole : undefined);
  const source = sourceRole ? (partyValues[sourceRole] ?? {}) : values;
  const value = formatReplacement(field.key ? source[field.key] : undefined);
  return value ? `${field.prefix ?? ""}${value}${field.suffix ?? ""}` : "";
}

function findReplacements(
  text: string,
  values: DynamicValues,
  template: TemplateDefinition,
  partyValues: PartyValueSources,
  currentPartyRole?: PartyRole,
): TextReplacement[] {
  const replacements: TextReplacement[] = [];
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    if (match.index === undefined) continue;
    const raw = match[0];
    const value = renderTemplateField(raw, values, template, partyValues, currentPartyRole);
    if (value === undefined) continue;
    replacements.push({ start: match.index, end: match.index + raw.length, value });
  }
  return replacements;
}

function setNodeText(node: Element, value: string): void {
  node.textContent = value;
  if (/^\s|\s$/u.test(value)) node.setAttributeNS(xmlNamespace, "xml:space", "preserve");
}

function replaceParagraphFields(
  paragraph: Element,
  values: DynamicValues,
  template: TemplateDefinition,
  partyValues: PartyValueSources,
  currentPartyRole?: PartyRole,
): void {
  const text = paragraphText(paragraph);
  if (!text.includes(PLACEHOLDER_DELIMITER)) return;
  const replacements = findReplacements(text, values, template, partyValues, currentPartyRole);
  if (replacements.length === 0) return;

  let offset = 0;
  const textNodes = Array.from(paragraph.getElementsByTagNameNS(ns, "t"));
  const ranges: TextNodeRange[] = textNodes.map((node) => {
    const start = offset;
    offset += node.textContent?.length ?? 0;
    return { node, start, end: offset };
  });

  for (const replacement of [...replacements].reverse()) {
    const startRange = ranges.find(
      (range) => replacement.start >= range.start && replacement.start < range.end,
    );
    const endRange = ranges.find(
      (range) => replacement.end > range.start && replacement.end <= range.end,
    );
    if (!startRange || !endRange) continue;

    const localStart = replacement.start - startRange.start;
    const localEnd = replacement.end - endRange.start;
    if (startRange === endRange) {
      const startText = startRange.node.textContent ?? "";
      setNodeText(
        startRange.node,
        `${startText.slice(0, localStart)}${replacement.value}${startText.slice(localEnd)}`,
      );
      continue;
    }

    const startIndex = ranges.indexOf(startRange);
    const endIndex = ranges.indexOf(endRange);
    const contentStart = replacement.start + PLACEHOLDER_DELIMITER.length;
    const contentEnd = replacement.end - PLACEHOLDER_DELIMITER.length;
    const contentRangeIndex = ranges.findIndex((range, index) => {
      if (index < startIndex || index > endIndex) return false;
      const overlapStart = Math.max(range.start, contentStart);
      const overlapEnd = Math.min(range.end, contentEnd);
      return overlapEnd > overlapStart && /\S/u.test(text.slice(overlapStart, overlapEnd));
    });
    const anchorIndex = contentRangeIndex === -1 ? startIndex : contentRangeIndex;

    for (let index = startIndex; index <= endIndex; index++) {
      const range = ranges[index]!;
      const currentText = range.node.textContent ?? "";
      const prefix = index === startIndex ? currentText.slice(0, localStart) : "";
      const renderedValue = index === anchorIndex ? replacement.value : "";
      const suffix = index === endIndex ? currentText.slice(localEnd) : "";
      setNodeText(range.node, `${prefix}${renderedValue}${suffix}`);
    }
  }
}

function replaceAcrossRuns(
  doc: Document,
  values: DynamicValues,
  template: TemplateDefinition,
  partyValues: PartyValueSources,
): void {
  const paragraphs = Array.from(doc.getElementsByTagNameNS(ns, "p"));
  const paragraphContexts = paragraphs.map((paragraph) => ({
    paragraph,
    partyRole: paragraphPartyRole(paragraph),
  }));
  for (const { paragraph, partyRole } of paragraphContexts) {
    replaceParagraphFields(paragraph, values, template, partyValues, partyRole);
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
    replaceParagraphFields(paragraph, values, template, partyValues, currentPartyRole);
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
  const boundary = resolveRepeatBoundary(startParagraph, endParagraph);
  if (!boundary) return;
  const children = Array.from(boundary.parent.childNodes);
  const startIndex = children.indexOf(boundary.startNode);
  const endIndex = children.indexOf(boundary.endNode);
  if (endIndex <= startIndex) return;
  const region = children.slice(startIndex + 1, endIndex);
  for (const party of parties)
    for (const original of region) {
      const clone = original.cloneNode(true);
      replaceInNode(clone, values, template, { ...partyValues, [role]: party }, role);
      boundary.parent.insertBefore(clone, boundary.endNode);
    }
  for (const original of region) boundary.parent.removeChild(original);
  boundary.parent.removeChild(boundary.startNode);
  boundary.parent.removeChild(boundary.endNode);
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
      formatPlaceholder("#קונים"),
      formatPlaceholder("/קונים"),
      "buyer",
      input.buyers ?? [],
      input.values,
      input.templateDefinition,
      partyValues,
    );
    expandRepeatSection(
      doc,
      formatPlaceholder("#מוכרים"),
      formatPlaceholder("/מוכרים"),
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

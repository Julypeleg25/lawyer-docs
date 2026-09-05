import { DOMParser } from "@xmldom/xmldom";
import PizZip from "pizzip";
import { parseInstruction } from "./instruction-parser.js";
import type { RepeatSection, TemplateFieldRequirement } from "../types.js";

export interface ParsedDocx { fields: TemplateFieldRequirement[]; repeatSections: RepeatSection[]; errors: string[] }
const contentParts = /^word\/(document|header\d+|footer\d+)\.xml$/;

export function getContentPartNames(zip: PizZip) { return Object.keys(zip.files).filter((name) => contentParts.test(name)); }
export function paragraphText(paragraph: Element) {
  const nodes = paragraph.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "t");
  return Array.from({ length: nodes.length }, (_, index) => nodes.item(index)?.textContent ?? "").join("");
}
export function parseDocx(buffer: Buffer): ParsedDocx {
  const zip = new PizZip(buffer); const fields: TemplateFieldRequirement[] = []; const errors: string[] = []; const markers = new Set<string>();
  for (const name of getContentPartNames(zip)) {
    const xml = zip.file(name)?.asText(); if (!xml) continue;
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const paragraphs = doc.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "p");
    for (let index = 0; index < paragraphs.length; index++) {
      const text = paragraphText(paragraphs.item(index)!); const xCount = [...text].filter((char) => char === "X").length;
      if (xCount % 2 !== 0) errors.push(`סימון X לא מאוזן בפסקה: ${text.slice(0, 120)}`);
      for (const match of text.matchAll(/X([^X]+)X/gu)) {
        const parsed = parseInstruction(match[1]!); if (parsed.error) errors.push(parsed.error);
        if (parsed.marker) markers.add(parsed.marker);
        else if (parsed.instruction) fields.push({ raw: match[0], label: parsed.label, ...parsed.instruction, classified: false });
      }
    }
  }
  const repeatSections: RepeatSection[] = [];
  for (const [role, hebrew] of [["buyers", "קונים"], ["sellers", "מוכרים"]] as const) {
    if (markers.has(`#${hebrew}`) !== markers.has(`/${hebrew}`)) errors.push(`סימון חזרה לא שלם עבור ${hebrew}`);
    if (markers.has(`#${hebrew}`)) repeatSections.push({ role, start: `X#${hebrew}X`, end: `X/${hebrew}X` });
  }
  return { fields, repeatSections, errors: [...new Set(errors)] };
}

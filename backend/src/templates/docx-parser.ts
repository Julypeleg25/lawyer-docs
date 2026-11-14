import { DOMParser } from "@xmldom/xmldom";
import PizZip from "pizzip";
import { parseInstruction } from "./instruction-parser.js";
import {
  countPlaceholderDelimiters,
  formatPlaceholder,
  PLACEHOLDER_PATTERN,
} from "./placeholder-syntax.js";
import { resolveRepeatBoundary } from "./repeat-boundary.js";
import type { PartyRole, RepeatSection, TemplateFieldRequirement } from "../types.js";

export interface ParsedDocx {
  fields: TemplateFieldRequirement[];
  repeatSections: RepeatSection[];
  errors: string[];
}
const contentParts = /^word\/(document|header\d+|footer\d+)\.xml$/;
const wordNamespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export function detectPartyRole(text: string): PartyRole | undefined {
  const mentionsBuyer = /קונ(?:ה|ים)/u.test(text);
  const mentionsSeller = /מוכר(?:ת|ים|ות)?/u.test(text);
  if (mentionsBuyer === mentionsSeller) return undefined;
  if (mentionsBuyer) return "buyer";
  if (mentionsSeller) return "seller";
  return undefined;
}

export function paragraphPartyRole(paragraph: Element): PartyRole | undefined {
  let ancestor: Node | null = paragraph.parentNode;
  while (ancestor) {
    if (ancestor.nodeType === 1 && (ancestor as Element).localName === "tr") {
      return detectPartyRole(paragraphText(ancestor as Element));
    }
    ancestor = ancestor.parentNode;
  }
  return detectPartyRole(paragraphText(paragraph));
}

function markerPartyRole(marker: string): PartyRole | undefined {
  if (marker === "#קונים" || marker === "/קונים") return "buyer";
  if (marker === "#מוכרים" || marker === "/מוכרים") return "seller";
  return undefined;
}

export function getContentPartNames(zip: PizZip): string[] {
  return Object.keys(zip.files).filter((name) => contentParts.test(name));
}
export function paragraphText(paragraph: Element): string {
  const nodes = paragraph.getElementsByTagNameNS(wordNamespace, "t");
  return Array.from(
    { length: nodes.length },
    (_, index) => nodes.item(index)?.textContent ?? "",
  ).join("");
}
export function parseDocx(buffer: Buffer): ParsedDocx {
  const zip = new PizZip(buffer);
  const fields: TemplateFieldRequirement[] = [];
  const errors: string[] = [];
  const markers = new Set<string>();
  for (const name of getContentPartNames(zip)) {
    const xml = zip.file(name)?.asText();
    if (!xml) continue;
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const paragraphs = Array.from(doc.getElementsByTagNameNS(wordNamespace, "p"));
    let activeRepeatRole: PartyRole | undefined;
    for (const paragraph of paragraphs) {
      const text = paragraphText(paragraph);
      const contextualPartyRole = paragraphPartyRole(paragraph);
      const delimiterCount = countPlaceholderDelimiters(text);
      if (delimiterCount % 2 !== 0) errors.push(`סימון <> לא מאוזן בפסקה: ${text.slice(0, 120)}`);
      for (const legacyMatch of text.matchAll(/X[^X]+X/gu))
        errors.push(`תחביר שדה מיושן אינו נתמך: ${legacyMatch[0]}. יש להשתמש בסימון <>שם השדה<>`);
      for (const legacyMatch of text.matchAll(/(?<!<)<(?!>)[^<>]+>(?!>)/gu))
        errors.push(`תחביר שדה מיושן אינו נתמך: ${legacyMatch[0]}. יש להשתמש בסימון <>שם השדה<>`);
      for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
        const parsed = parseInstruction(match[1]!);
        if (parsed.error) errors.push(parsed.error);
        if (parsed.marker) {
          markers.add(parsed.marker);
          const markerRole = markerPartyRole(parsed.marker);
          if (parsed.marker.startsWith("#")) {
            if (activeRepeatRole) {
              errors.push("סימוני חזרה מקוננים אינם נתמכים");
            }
            activeRepeatRole = markerRole;
          } else if (markerRole !== activeRepeatRole) {
            errors.push(`סימון סיום חזרה אינו תואם: ${match[0]}`);
            activeRepeatRole = undefined;
          } else {
            activeRepeatRole = undefined;
          }
        } else if (parsed.instruction) {
          const partyRole =
            detectPartyRole(parsed.label) ?? contextualPartyRole ?? activeRepeatRole;
          fields.push({
            raw: match[0],
            label: parsed.label,
            ...parsed.instruction,
            classified: false,
            ...(partyRole ? { partyRole } : {}),
          });
        }
      }
    }
    if (activeRepeatRole) errors.push(`סימון חזרה לא נסגר בקובץ: ${name}`);
    for (const roleLabel of ["קונים", "מוכרים"] as const) {
      const start = paragraphs.find((paragraph) =>
        paragraphText(paragraph).includes(formatPlaceholder(`#${roleLabel}`)),
      );
      const end = paragraphs.find((paragraph) =>
        paragraphText(paragraph).includes(formatPlaceholder(`/${roleLabel}`)),
      );
      if (start && end && !resolveRepeatBoundary(start, end)) {
        errors.push(`סימוני החזרה עבור ${roleLabel} אינם נמצאים באותו אזור או באותה טבלה`);
      }
    }
  }
  const repeatSections: RepeatSection[] = [];
  for (const [role, hebrew] of [
    ["buyers", "קונים"],
    ["sellers", "מוכרים"],
  ] as const) {
    if (markers.has(`#${hebrew}`) !== markers.has(`/${hebrew}`))
      errors.push(`סימון חזרה לא שלם עבור ${hebrew}`);
    if (markers.has(`#${hebrew}`))
      repeatSections.push({
        role,
        start: formatPlaceholder(`#${hebrew}`),
        end: formatPlaceholder(`/${hebrew}`),
      });
  }
  return { fields, repeatSections, errors: [...new Set(errors)] };
}

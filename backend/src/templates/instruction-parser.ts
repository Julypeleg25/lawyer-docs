import type { ParsedInstruction } from "../types.js";

export interface InstructionResult {
  label: string;
  instruction?: ParsedInstruction;
  error?: string;
  marker?: string;
}
type Rule = (raw: string) => InstructionResult | undefined;
const optionalPrefix: Rule = (raw) => {
  const match = /^(.+?)\s*[–-]\s*לא חובה\s*\(להוסיף את המילה\s+(.+?)\)$/u.exec(raw);
  return match
    ? { label: match[1]!.trim(), instruction: { required: false, prefix: `${match[2]!.trim()} ` } }
    : undefined;
};
const optional: Rule = (raw) => {
  const match = /^(.+?)\s*[–-]\s*לא חובה$/u.exec(raw);
  return match ? { label: match[1]!.trim(), instruction: { required: false } } : undefined;
};
const marker: Rule = (raw) =>
  /^#(קונים|מוכרים)$|^\/(קונים|מוכרים)$/u.test(raw.trim())
    ? { label: raw.trim(), marker: raw.trim() }
    : undefined;
const plain: Rule = (raw) =>
  !/[()]/u.test(raw) && !/\s[–-]\s/u.test(raw)
    ? { label: raw.trim(), instruction: { required: true } }
    : undefined;
const rules = [marker, optionalPrefix, optional, plain];
export function parseInstruction(raw: string): InstructionResult {
  for (const rule of rules) {
    const result = rule(raw);
    if (result) return result;
  }
  return { label: raw.trim(), error: `הוראה אינה נתמכת: X${raw}X` };
}

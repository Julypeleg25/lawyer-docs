import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { parseInstruction } from "./instruction-parser.js";
import { parseDocx } from "./docx-parser.js";
import { generateDocument } from "../generation/document-generator.js";
import type { TemplateDefinition } from "../types.js";

const prefix = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`;
function docx(xmlBody: string): Buffer {
  const zip = new PizZip();
  zip.file("word/document.xml", `${prefix}${xmlBody}</w:body></w:document>`);
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`,
  );
  return zip.generate({ type: "nodebuffer" });
}
function visible(buffer: Buffer): string {
  const documentFile = new PizZip(buffer).file("word/document.xml");
  if (!documentFile) throw new Error("Generated DOCX is missing word/document.xml");
  return documentFile.asText().replace(/<[^>]+>/g, "");
}

describe("template engine", () => {
  it("detects a placeholder split across Word runs", () => {
    const parsed = parseDocx(
      docx(`<w:p><w:r><w:t>Xיום</w:t></w:r><w:r><w:t> החתימהX</w:t></w:r></w:p>`),
    );
    expect(parsed.fields.map((field) => field.label)).toEqual(["יום החתימה"]);
  });
  it("parses the optional prefix instruction deterministically", () => {
    expect(parseInstruction("תיאור חוב – לא חובה (להוסיף את המילה למעט)")).toEqual({
      label: "תיאור חוב",
      instruction: { required: false, prefix: "למעט " },
    });
  });
  it("replaces across runs and removes an empty optional field", () => {
    const buffer = docx(
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Xיום</w:t></w:r><w:r><w:t> החתימהX</w:t></w:r></w:p><w:p><w:r><w:t>Xתיאור חוב – לא חובה (להוסיף את המילה למעט)X</w:t></w:r></w:p>`,
    );
    const definition: TemplateDefinition = {
      id: "a",
      filename: "a.docx",
      displayName: "a",
      hash: "h",
      absolutePath: "",
      valid: true,
      errors: [],
      repeatSections: [],
      fields: [
        { raw: "Xיום החתימהX", label: "יום החתימה", key: "date", required: true, classified: true },
        {
          raw: "Xתיאור חוב – לא חובה (להוסיף את המילה למעט)X",
          label: "תיאור חוב",
          key: "debt",
          required: false,
          prefix: "למעט ",
          classified: true,
        },
      ],
    };
    const output = generateDocument({
      templateBuffer: buffer,
      templateDefinition: definition,
      values: { date: "5.9.2026", debt: "" },
    });
    expect(visible(output)).toContain("5.9.2026");
    expect(visible(output)).not.toContain("Xתיאור");
  });
  it("duplicates an explicitly marked buyer region", () => {
    const buffer = docx(
      `<w:p><w:r><w:t>X#קוניםX</w:t></w:r></w:p><w:p><w:r><w:t>Xשם קונהX</w:t></w:r></w:p><w:p><w:r><w:t>X/קוניםX</w:t></w:r></w:p>`,
    );
    const definition: TemplateDefinition = {
      id: "a",
      filename: "a.docx",
      displayName: "a",
      hash: "h",
      absolutePath: "",
      valid: true,
      errors: [],
      repeatSections: [{ role: "buyers", start: "X#קוניםX", end: "X/קוניםX" }],
      fields: [
        { raw: "Xשם קונהX", label: "שם קונה", key: "name", required: true, classified: true },
      ],
    };
    const output = visible(
      generateDocument({
        templateBuffer: buffer,
        templateDefinition: definition,
        values: {},
        buyers: [{ name: "דנה" }, { name: "יואב" }],
      }),
    );
    expect(output).toContain("דנה");
    expect(output).toContain("יואב");
    expect(output).not.toContain("#קונים");
  });
});

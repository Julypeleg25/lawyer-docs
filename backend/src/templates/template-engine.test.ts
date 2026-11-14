import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import PizZip from "pizzip";
import { parseInstruction } from "./instruction-parser.js";
import { paragraphText, parseDocx } from "./docx-parser.js";
import { isPlaceholder } from "./placeholder-syntax.js";
import { generateDocument } from "../generation/document-generator.js";
import { validatePartyCounts } from "../generation/validation.service.js";
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
function documentXml(buffer: Buffer): Document {
  const documentFile = new PizZip(buffer).file("word/document.xml");
  if (!documentFile) throw new Error("Generated DOCX is missing word/document.xml");
  return new DOMParser().parseFromString(documentFile.asText(), "application/xml");
}

describe("template engine", () => {
  it("detects a placeholder split across Word runs", () => {
    const parsed = parseDocx(
      docx(`<w:p><w:r><w:t>&lt;&gt;יום</w:t></w:r><w:r><w:t> החתימה&lt;&gt;</w:t></w:r></w:p>`),
    );
    expect(parsed.fields.map((field) => field.label)).toEqual(["יום החתימה"]);
  });
  it("rejects the legacy delimiter formats", () => {
    const parsed = parseDocx(
      docx(
        `<w:p><w:r><w:t>Xlegacy fieldX</w:t></w:r></w:p><w:p><w:r><w:t>&lt;legacy field&gt;</w:t></w:r></w:p>`,
      ),
    );

    expect(parsed.fields).toHaveLength(0);
    expect(parsed.errors).toHaveLength(2);
    expect(parsed.errors.every((error) => error.includes("<>שם השדה<>"))).toBe(true);
  });
  it("recognizes only complete paired delimiters", () => {
    expect(isPlaceholder("<>field<>")).toBe(true);
    expect(isPlaceholder("<field>")).toBe(false);
    expect(isPlaceholder("XfieldX")).toBe(false);
    expect(isPlaceholder("<>field")).toBe(false);
  });
  it("parses the optional prefix instruction deterministically", () => {
    expect(parseInstruction("תיאור חוב – לא חובה (להוסיף את המילה למעט)")).toEqual({
      label: "תיאור חוב",
      instruction: { required: false, prefix: "למעט " },
    });
  });
  it("replaces across runs and removes an empty optional field", () => {
    const buffer = docx(
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>&lt;&gt;יום</w:t></w:r><w:r><w:t> החתימה&lt;&gt;</w:t></w:r></w:p><w:p><w:r><w:t>&lt;&gt;תיאור חוב – לא חובה (להוסיף את המילה למעט)&lt;&gt;</w:t></w:r></w:p>`,
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
        {
          raw: "<>יום החתימה<>",
          label: "יום החתימה",
          key: "date",
          required: true,
          classified: true,
        },
        {
          raw: "<>תיאור חוב – לא חובה (להוסיף את המילה למעט)<>",
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
    expect(visible(output)).not.toContain("<>תיאור");
  });
  it("preserves surrounding run formatting and exact spaces", () => {
    const buffer = docx(
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">כותרת </w:t></w:r><w:r><w:t>&lt;&gt;יום</w:t></w:r><w:r><w:t xml:space="preserve"> החתימה&lt;&gt;</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve"> סוף</w:t></w:r></w:p>`,
    );
    const definition: TemplateDefinition = {
      id: "formatting",
      filename: "formatting.docx",
      displayName: "formatting",
      hash: "h",
      absolutePath: "",
      valid: true,
      errors: [],
      repeatSections: [],
      fields: [
        {
          raw: "<>יום החתימה<>",
          label: "יום החתימה",
          key: "date",
          required: true,
          classified: true,
        },
      ],
    };

    const output = documentXml(
      generateDocument({
        templateBuffer: buffer,
        templateDefinition: definition,
        values: { date: "5.9.2026" },
      }),
    );
    const paragraph = output.getElementsByTagNameNS(
      "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
      "p",
    )[0]!;
    const textNodes = Array.from(
      paragraph.getElementsByTagNameNS(
        "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        "t",
      ),
    );
    const runs = textNodes.map((node) => node.parentNode as Element);

    expect(paragraphText(paragraph)).toBe("כותרת 5.9.2026 סוף");
    expect(textNodes.map((node) => node.textContent)).toEqual(["כותרת ", "5.9.2026", "", " סוף"]);
    expect(
      runs[0]!.getElementsByTagNameNS(
        "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        "b",
      ),
    ).toHaveLength(1);
    expect(
      runs[1]!.getElementsByTagNameNS(
        "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        "b",
      ),
    ).toHaveLength(0);
    expect(
      runs[3]!.getElementsByTagNameNS(
        "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        "i",
      ),
    ).toHaveLength(1);
    expect(textNodes[0]!.getAttribute("xml:space")).toBe("preserve");
    expect(textNodes[3]!.getAttribute("xml:space")).toBe("preserve");
  });
  it("uses the field-content formatting instead of the delimiter formatting", () => {
    const buffer = docx(
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>&lt;&gt;</w:t></w:r><w:r><w:t>הנותר בדירה</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>&lt;&gt;</w:t></w:r></w:p>`,
    );
    const definition: TemplateDefinition = {
      id: "mixed-formatting",
      filename: "mixed-formatting.docx",
      displayName: "mixed-formatting",
      hash: "h",
      absolutePath: "",
      valid: true,
      errors: [],
      repeatSections: [],
      fields: [
        {
          raw: "<>הנותר בדירה<>",
          label: "הנותר בדירה",
          key: "remaining",
          required: true,
          classified: true,
        },
      ],
    };

    const output = documentXml(
      generateDocument({
        templateBuffer: buffer,
        templateDefinition: definition,
        values: { remaining: "ארון" },
      }),
    );
    const paragraph = output.getElementsByTagNameNS(
      "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
      "p",
    )[0]!;
    const textNodes = Array.from(
      paragraph.getElementsByTagNameNS(
        "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        "t",
      ),
    );
    const valueRun = textNodes[1]!.parentNode as Element;

    expect(paragraphText(paragraph)).toBe("ארון");
    expect(textNodes.map((node) => node.textContent)).toEqual(["", "ארון", ""]);
    expect(
      valueRun.getElementsByTagNameNS(
        "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        "b",
      ),
    ).toHaveLength(0);
  });
  it("duplicates an explicitly marked buyer region", () => {
    const buffer = docx(
      `<w:p><w:r><w:t>&lt;&gt;#קונים&lt;&gt;</w:t></w:r></w:p><w:p><w:r><w:t>&lt;&gt;שם קונה&lt;&gt;</w:t></w:r></w:p><w:p><w:r><w:t>&lt;&gt;/קונים&lt;&gt;</w:t></w:r></w:p>`,
    );
    const definition: TemplateDefinition = {
      id: "a",
      filename: "a.docx",
      displayName: "a",
      hash: "h",
      absolutePath: "",
      valid: true,
      errors: [],
      repeatSections: [{ role: "buyers", start: "<>#קונים<>", end: "<>/קונים<>" }],
      fields: [
        {
          raw: "<>שם קונה<>",
          label: "שם קונה",
          key: "name",
          required: true,
          classified: true,
          partyRole: "buyer",
        },
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

  it("assigns generic fields inside a repeat section to its party role", () => {
    const parsed = parseDocx(
      docx(
        `<w:p><w:r><w:t>&lt;&gt;#קונים&lt;&gt;</w:t></w:r></w:p><w:p><w:r><w:t>&lt;&gt;מספר זיהוי&lt;&gt;</w:t></w:r></w:p><w:p><w:r><w:t>&lt;&gt;/קונים&lt;&gt;</w:t></w:r></w:p>`,
      ),
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.fields).toHaveLength(1);
    expect(parsed.fields[0]?.partyRole).toBe("buyer");
  });

  it("duplicates a table row enclosed by dedicated marker rows", () => {
    const buffer = docx(
      `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>&lt;&gt;#קונים&lt;&gt;</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>&lt;&gt;שם קונה&lt;&gt;</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>&lt;&gt;מספר זיהוי&lt;&gt;</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>&lt;&gt;/קונים&lt;&gt;</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`,
    );
    const parsed = parseDocx(buffer);
    expect(parsed.errors).toEqual([]);
    const definition: TemplateDefinition = {
      id: "table-repeat",
      filename: "table-repeat.docx",
      displayName: "table-repeat",
      hash: "h",
      absolutePath: "",
      valid: true,
      errors: [],
      repeatSections: [{ role: "buyers", start: "<>#קונים<>", end: "<>/קונים<>" }],
      fields: [
        {
          raw: "<>שם קונה<>",
          label: "שם קונה",
          key: "name",
          scope: "person",
          required: true,
          classified: true,
          partyRole: "buyer",
        },
        {
          raw: "<>מספר זיהוי<>",
          label: "מספר זיהוי",
          key: "idNumber",
          scope: "person",
          required: true,
          classified: true,
          partyRole: "buyer",
        },
      ],
    };
    const output = documentXml(
      generateDocument({
        templateBuffer: buffer,
        templateDefinition: definition,
        values: {},
        buyers: [
          { name: "ראשון", idNumber: "111" },
          { name: "שני", idNumber: "222" },
        ],
      }),
    );
    const rows = Array.from(
      output.getElementsByTagNameNS(
        "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        "tr",
      ),
    );

    expect(rows.map((row) => paragraphText(row))).toEqual(["ראשון111", "שני222"]);
  });

  it("keeps buyer and seller values separate without repeat markers", () => {
    const buffer = docx(
      `<w:p><w:r><w:t>&lt;&gt;שם פרטי מוכר&lt;&gt;</w:t></w:r></w:p><w:p><w:r><w:t>&lt;&gt;שם פרטי קונה&lt;&gt;</w:t></w:r></w:p>`,
    );
    const definition: TemplateDefinition = {
      id: "roles",
      filename: "roles.docx",
      displayName: "roles",
      hash: "h",
      absolutePath: "",
      valid: true,
      errors: [],
      repeatSections: [],
      fields: [
        {
          raw: "<>שם פרטי מוכר<>",
          label: "שם פרטי מוכר",
          key: "firstName",
          required: true,
          classified: true,
          partyRole: "seller",
        },
        {
          raw: "<>שם פרטי קונה<>",
          label: "שם פרטי קונה",
          key: "firstName",
          required: true,
          classified: true,
          partyRole: "buyer",
        },
      ],
    };
    const parsed = parseDocx(buffer);
    expect(parsed.fields.map((field) => field.partyRole)).toEqual(["seller", "buyer"]);
    const output = visible(
      generateDocument({
        templateBuffer: buffer,
        templateDefinition: definition,
        values: {},
        buyers: [{ firstName: "קונה בדיקה" }],
        sellers: [{ firstName: "מוכר בדיקה" }],
      }),
    );
    expect(output).toContain("מוכר בדיקה");
    expect(output).toContain("קונה בדיקה");
  });

  it("uses table-row context for shared buyer and seller fields", () => {
    const buffer = docx(
      `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>&lt;&gt;שם פרטי מוכר&lt;&gt;</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>&lt;&gt;מספר זיהוי&lt;&gt;</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>&lt;&gt;שם פרטי קונה&lt;&gt;</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>&lt;&gt;מספר זיהוי&lt;&gt;</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>&lt;&gt;החלק בזכות&lt;&gt;</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`,
    );
    const parsed = parseDocx(buffer);
    expect(parsed.fields.map((field) => field.partyRole)).toEqual([
      "seller",
      "seller",
      "buyer",
      "buyer",
      "buyer",
    ]);

    const definition: TemplateDefinition = {
      id: "table-context",
      filename: "table-context.docx",
      displayName: "table-context",
      hash: "h",
      absolutePath: "",
      valid: true,
      errors: [],
      repeatSections: [],
      fields: [
        {
          raw: "<>שם פרטי מוכר<>",
          label: "שם פרטי מוכר",
          key: "firstName",
          scope: "person",
          required: true,
          classified: true,
          partyRole: "seller",
        },
        {
          raw: "<>מספר זיהוי<>",
          label: "מספר זיהוי",
          key: "idNumber",
          scope: "person",
          required: true,
          classified: true,
          partyRole: "seller",
        },
        {
          raw: "<>שם פרטי קונה<>",
          label: "שם פרטי קונה",
          key: "firstName",
          scope: "person",
          required: true,
          classified: true,
          partyRole: "buyer",
        },
        {
          raw: "<>מספר זיהוי<>",
          label: "מספר זיהוי",
          key: "idNumber",
          scope: "person",
          required: true,
          classified: true,
          partyRole: "buyer",
        },
        {
          raw: "<>החלק בזכות<>",
          label: "החלק בזכות",
          key: "share",
          scope: "transaction",
          required: true,
          classified: true,
        },
      ],
    };
    const output = visible(
      generateDocument({
        templateBuffer: buffer,
        templateDefinition: definition,
        values: { share: "מחצית" },
        buyers: [{ firstName: "רוכש", idNumber: "BUYER-ID" }],
        sellers: [{ firstName: "מעביר", idNumber: "SELLER-ID" }],
      }),
    );

    expect(output).toContain("מעבירSELLER-ID");
    expect(output).toContain("רוכשBUYER-IDמחצית");
  });

  it("blocks multiple parties when a template has no repeat section", () => {
    const definition: TemplateDefinition = {
      id: "single-party",
      filename: "single-party.docx",
      displayName: "single-party",
      hash: "h",
      absolutePath: "",
      valid: true,
      errors: [],
      repeatSections: [],
      fields: [
        {
          raw: "<>שם פרטי קונה<>",
          label: "שם פרטי קונה",
          key: "firstName",
          scope: "person",
          required: true,
          classified: true,
          partyRole: "buyer",
        },
      ],
    };

    expect(() => validatePartyCounts([definition], 1, 1)).not.toThrow();
    expect(() => validatePartyCounts([definition], 2, 1)).toThrowError(
      "MULTIPLE_PARTIES_REQUIRE_REPEAT_SECTION",
    );
    expect(() =>
      validatePartyCounts(
        [
          {
            ...definition,
            repeatSections: [{ role: "buyers", start: "<>#קונים<>", end: "<>/קונים<>" }],
          },
        ],
        2,
        1,
      ),
    ).not.toThrow();
  });
});

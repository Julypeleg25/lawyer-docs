# Template inventory

## טיוטת הסכם מכר.docx

- Main document contains paragraphs and numbering; no headers, footers, or media parts were found.
- 19 syntactically matched placeholders were found across Word runs.
- Supported optional instruction: `<>תיאור חוב – לא חובה (להוסיף את המילה למעט)<>`.
- The scanner treats paired `<>` tokens as the only supported field delimiters and marks malformed pairs invalid rather than guessing boundaries.
- Buyer and seller placeholders are explicitly distinguished by their role suffixes.
- No explicit buyer/seller repeat boundaries exist. To support multiple parties, add the documented `<>#קונים<>` / `<>/קונים<>` and `<>#מוכרים<>` / `<>/מוכרים<>` marker paragraphs.
- Several newly discovered labels require classification in the fields management screen before the template becomes usable.

## שטר מכר עדכני.docx

- 18 placeholder occurrences were found across Word runs, representing 8 distinct field labels.
- Buyer and seller name placeholders are explicitly distinguished.
- Shared identification labels are assigned to the buyer or seller from their containing table row.
- The buyer and seller names in the signature table use the same dynamic party fields; no static party names remain.
- No unsupported instructions or malformed delimiters were found.
- No explicit buyer/seller repeat boundaries exist.

Template binaries live in `templates/` and are intended to be version-controlled. This report records structural observations and does not alter legal wording.

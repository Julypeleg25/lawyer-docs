import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { api, ApiError } from "../../shared/api";
import {
  fieldDefinitionSchema,
  fieldTypeSchema,
  templateSchema,
  type FieldDefinition,
  type FieldType,
} from "../../types";

const templateListSchema = z.array(templateSchema);
const fieldDefinitionListSchema = z.array(fieldDefinitionSchema);
const fieldScopeSchema = z.enum(["person", "property", "transaction"]);
type FieldScope = z.infer<typeof fieldScopeSchema>;
interface ClassificationDraft {
  scope: FieldScope | "";
  type: FieldType;
  searchable: boolean;
  filterable: boolean;
}

const scopeLabels: Record<FieldScope, string> = {
  person: "לקוח",
  property: "נכס",
  transaction: "עסקה",
};
const typeLabels: Record<FieldType, string> = {
  text: "טקסט",
  textarea: "טקסט ארוך",
  number: "מספר",
  date: "תאריך",
  boolean: "כן / לא",
  select: "בחירה",
  money: "סכום כסף",
  percentage: "אחוז",
  idNumber: "תעודת זהות",
  address: "כתובת",
};

function classificationErrorMessage(error: Error | null): string | undefined {
  if (!error) return undefined;
  if (error instanceof ApiError && error.code === "CLASSIFICATION_SET_CHANGED") {
    return "רשימת השדות השתנתה. יש לרענן ולסווג מחדש את הרשימה העדכנית.";
  }
  return "שמירת הסיווגים נכשלה. נסו שוב.";
}

export function TemplatesPage() {
  const client = useQueryClient();
  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: () => api("/templates", templateListSchema),
  });
  const fields = useQuery({
    queryKey: ["fields"],
    queryFn: () => api("/fields", fieldDefinitionListSchema),
  });
  const refresh = useMutation({
    mutationFn: () => api("/templates/refresh", templateListSchema, { method: "POST" }),
    onSuccess: () => client.invalidateQueries(),
  });
  const approveClassifications = useMutation({
    mutationFn: (
      classifications: ({ id: string } & Omit<ClassificationDraft, "scope"> & {
          scope: FieldScope;
        })[],
    ) =>
      api("/fields/classifications", fieldDefinitionListSchema, {
        method: "PUT",
        body: JSON.stringify({ classifications }),
      }),
    onSuccess: () => client.invalidateQueries(),
  });
  const resetClassifications = useMutation({
    mutationFn: () =>
      api("/fields/classifications/reset", fieldDefinitionListSchema, { method: "POST" }),
    onSuccess: () => client.invalidateQueries(),
  });
  const pendingFields = fields.data?.filter((field) => !field.classified) ?? [];
  const classificationError = classificationErrorMessage(
    approveClassifications.error ?? resetClassifications.error,
  );
  return (
    <section>
      <div className="pageTitle">
        <div>
          <p className="eyebrow">ניהול</p>
          <h1>תבניות המסמכים</h1>
          <p>התבניות נקראות מתיקיית Git ואינן ניתנות לעריכה באתר.</p>
        </div>
        <button className="primary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          רענון תבניות
        </button>
      </div>
      <div className="cards">
        {templates.data?.map((t) => (
          <article className="card templateCard" key={t.id}>
            <div className="statusRow">
              <h2>{t.displayName}</h2>
              <span className={t.valid ? "badge good" : "badge bad"}>
                {t.valid ? "תקין" : "דורש תיקון"}
              </span>
            </div>
            <dl>
              <dt>קובץ</dt>
              <dd dir="ltr">{t.filename}</dd>
              <dt>מספר שדות</dt>
              <dd>{t.fields.length}</dd>
              <dt>מזהה שינוי</dt>
              <dd dir="ltr">{t.hash.slice(0, 12)}</dd>
            </dl>
            {t.errors.map((e) => (
              <p className="inlineError" key={e}>
                {e}
              </p>
            ))}
          </article>
        ))}
      </div>
      <div className="classificationHeader">
        <div>
          <h2 className="subTitle">סיווג שדות</h2>
          <p className="muted">יש לסווג את כל השדות ולאשר את הרשימה כיחידה אחת.</p>
        </div>
        <button
          className="dangerSecondary"
          disabled={resetClassifications.isPending || !fields.data?.length}
          onClick={() => {
            if (window.confirm("לאפס את אישור הסיווג של כל השדות ולהתחיל מחדש?")) {
              resetClassifications.mutate();
            }
          }}
        >
          איפוס סיווגים
        </button>
      </div>
      {classificationError && (
        <div className="errorPanel" role="alert">
          {classificationError}
        </div>
      )}
      {pendingFields.length === 0 ? (
        <div className="card approvalSuccess">כל השדות סווגו ואושרו.</div>
      ) : (
        <ClassificationEditor
          key={pendingFields.map((field) => field._id).join("|")}
          fields={pendingFields}
          isSaving={approveClassifications.isPending}
          onApprove={(classifications) => approveClassifications.mutate(classifications)}
        />
      )}
    </section>
  );
}

function ClassificationEditor({
  fields,
  isSaving,
  onApprove,
}: {
  fields: FieldDefinition[];
  isSaving: boolean;
  onApprove: (
    classifications: ({ id: string } & Omit<ClassificationDraft, "scope"> & {
        scope: FieldScope;
      })[],
  ) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, ClassificationDraft>>(() =>
    Object.fromEntries(
      fields.map((field) => [
        field._id,
        {
          scope: field.scope ?? "",
          type: field.type,
          searchable: field.searchable,
          filterable: field.filterable,
        },
      ]),
    ),
  );
  const classifiedCount = fields.filter((field) => drafts[field._id]?.scope).length;
  const allClassified = classifiedCount === fields.length;

  const updateDraft = (fieldId: string, update: Partial<ClassificationDraft>): void => {
    setDrafts((current) => ({
      ...current,
      [fieldId]: { ...current[fieldId]!, ...update },
    }));
  };

  const approve = (): void => {
    const classifications = fields.flatMap((field) => {
      const draft = drafts[field._id];
      return draft?.scope ? [{ id: field._id, ...draft, scope: draft.scope }] : [];
    });
    if (classifications.length !== fields.length) return;
    if (window.confirm(`לאשר ולשמור את הסיווג של כל ${fields.length} השדות?`)) {
      onApprove(classifications);
    }
  };

  return (
    <div className="classificationEditor">
      <div className="classificationProgress" aria-live="polite">
        סווגו {classifiedCount} מתוך {fields.length} שדות
      </div>
      {fields.map((field) => {
        const draft = drafts[field._id]!;
        return (
          <div className="card classification" key={field._id}>
            <div>
              <strong>{field.label}</strong>
              <small dir="ltr">{field.key}</small>
            </div>
            <label>
              <span>שיוך</span>
              <select
                value={draft.scope}
                onChange={(event) => {
                  const scope = event.target.value
                    ? fieldScopeSchema.parse(event.target.value)
                    : "";
                  updateDraft(field._id, { scope });
                }}
              >
                <option value="">יש לבחור</option>
                {Object.entries(scopeLabels).map(([scope, label]) => (
                  <option key={scope} value={scope}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>סוג שדה</span>
              <select
                value={draft.type}
                onChange={(event) => {
                  const type = fieldTypeSchema.parse(event.target.value);
                  updateDraft(field._id, { type });
                }}
              >
                {Object.entries(typeLabels).map(([type, label]) => (
                  <option key={type} value={type}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkField">
              <input
                type="checkbox"
                checked={draft.searchable}
                onChange={(event) => updateDraft(field._id, { searchable: event.target.checked })}
              />
              ניתן לחיפוש
            </label>
            <label className="checkField">
              <input
                type="checkbox"
                checked={draft.filterable}
                onChange={(event) => updateDraft(field._id, { filterable: event.target.checked })}
              />
              ניתן לסינון
            </label>
          </div>
        );
      })}
      <div className="classificationActions">
        {!allClassified && <span>יש לבחור שיוך לכל השדות לפני האישור.</span>}
        <button className="primary" disabled={!allClassified || isSaving} onClick={approve}>
          {isSaving ? "שומר סיווגים…" : "אישור ושמירת כל הסיווגים"}
        </button>
      </div>
    </div>
  );
}

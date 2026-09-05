import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { api, ApiError } from "../../shared/api";
import { ConfirmDialog } from "../../shared/ConfirmDialog";
import {
  fieldDefinitionSchema,
  fieldTypeSchema,
  templateSchema,
  type FieldDefinition,
  type FieldType,
  type Template,
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
interface ResetRequest {
  fieldIds?: string[];
  title: string;
  description: string;
  confirmLabel: string;
}

const scopeLabels: Record<FieldScope, string> = {
  person: "לקוח",
  property: "נכס",
  transaction: "עסקה",
};
const partyRoleLabels = {
  buyer: "קונה",
  seller: "מוכר",
} as const;
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

function getTemplateFieldIds(template: Template, fields: FieldDefinition[]): string[] {
  const templateKeys = new Set(template.fields.flatMap((field) => (field.key ? [field.key] : [])));
  return fields.filter((field) => templateKeys.has(field.key)).map((field) => field._id);
}

export function TemplatesPage() {
  const client = useQueryClient();
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [resetRequest, setResetRequest] = useState<ResetRequest | null>(null);
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
    mutationFn: (fieldIds?: string[]) =>
      api("/fields/classifications/reset", fieldDefinitionListSchema, {
        method: "POST",
        body: JSON.stringify(fieldIds ? { fieldIds } : {}),
      }),
    onSuccess: () => {
      setResetRequest(null);
      return client.invalidateQueries();
    },
  });

  const allTemplates = templates.data ?? [];
  const allFields = fields.data ?? [];
  const activeTemplate = activeTemplateId
    ? allTemplates.find((template) => template.id === activeTemplateId)
    : undefined;
  const visibleFieldIds = new Set(
    activeTemplate
      ? getTemplateFieldIds(activeTemplate, allFields)
      : allFields.map((field) => field._id),
  );
  const pendingFields = allFields.filter((field) => !field.classified);
  const approvedVisibleFields = allFields.filter(
    (field) => field.classified && visibleFieldIds.has(field._id),
  );
  const classificationError = classificationErrorMessage(
    approveClassifications.error ?? resetClassifications.error,
  );

  const requestFullReset = (): void => {
    if (allFields.length === 0) return;
    setResetRequest({
      title: "לאפס את כל הסיווגים?",
      description:
        pendingFields.length > 0
          ? "הבחירות שטרם אושרו יימחקו וכל השדות ייפתחו מחדש לסיווג. לא ניתן לבטל פעולה זו."
          : "כל השדות ייפתחו מחדש לסיווג ולאישור. לא ניתן לבטל פעולה זו.",
      confirmLabel: "איפוס כל הסיווגים",
    });
  };
  const requestTemplateReset = (): void => {
    if (!activeTemplate) return;
    const fieldIds = getTemplateFieldIds(activeTemplate, allFields);
    if (fieldIds.length === 0) return;
    setResetRequest({
      fieldIds,
      title: `לאפס את סיווגי „${activeTemplate.displayName}”?`,
      description:
        "השדות המשמשים מסמך זה ייפתחו מחדש לאישור. שדה משותף עשוי להופיע גם במסמכים אחרים.",
      confirmLabel: "איפוס סיווגי המסמך",
    });
  };
  const requestFieldReset = (field: FieldDefinition): void => {
    setResetRequest({
      fieldIds: [field._id],
      title: `לאפס את הסיווג של „${field.label}”?`,
      description: "רק שדה זה ייפתח מחדש לסיווג ולאישור.",
      confirmLabel: "איפוס הסיווג",
    });
  };

  return (
    <section>
      <div className="pageTitle">
        <div>
          <h1>תבניות המסמכים</h1>
          <p>צפייה בתבניות ובסיווג השדות שלהן.</p>
        </div>
        <button className="primary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          רענון תבניות
        </button>
      </div>
      <div className="cards">
        {allTemplates.map((template) => (
          <article className="card templateCard" key={template.id}>
            <div className="statusRow">
              <h2>{template.displayName}</h2>
              <span className={template.valid ? "badge good" : "badge bad"}>
                {template.valid ? "תקין" : "דורש תיקון"}
              </span>
            </div>
            <dl>
              <dt>קובץ</dt>
              <dd dir="ltr">{template.filename}</dd>
              <dt>מספר שדות</dt>
              <dd>{template.fields.length}</dd>
              <dt>מזהה שינוי</dt>
              <dd dir="ltr">{template.hash.slice(0, 12)}</dd>
            </dl>
            {template.errors.map((error) => (
              <p className="inlineError" key={error}>
                {error}
              </p>
            ))}
            <details className="templateFieldDetails">
              <summary>
                <span>שדות בתבנית</span>
                <span className="fieldCount">{template.fields.length}</span>
              </summary>
              {template.fields.length === 0 ? (
                <p className="muted">לא התגלו שדות בתבנית זו.</p>
              ) : (
                <ol className="templateFieldList">
                  {template.fields.map((field, index) => (
                    <li key={`${field.raw}-${index}`}>
                      <div className="templateFieldIdentity">
                        <strong>{field.label}</strong>
                        <code dir="rtl">{field.raw}</code>
                      </div>
                      <div className="templateFieldMeta">
                        <span className={field.required ? "fieldTag required" : "fieldTag"}>
                          {field.required ? "חובה" : "רשות"}
                        </span>
                        {field.partyRole && (
                          <span className="fieldTag role">{partyRoleLabels[field.partyRole]}</span>
                        )}
                        {field.scope && (
                          <span className="fieldTag">{scopeLabels[field.scope]}</span>
                        )}
                        {field.type && <span className="fieldTag">{typeLabels[field.type]}</span>}
                        {!field.classified && (
                          <span className="fieldTag warning">ממתין לסיווג</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </details>
          </article>
        ))}
      </div>

      <div className="classificationHeader">
        <h2 className="subTitle">סיווג שדות</h2>
        <button
          type="button"
          className="dangerSecondary"
          disabled={
            resetClassifications.isPending ||
            allFields.length === 0 ||
            pendingFields.length === allFields.length
          }
          onClick={requestFullReset}
        >
          איפוס כל הסיווגים
        </button>
      </div>

      <div className="documentFilterBar classificationFilterBar">
        <span className="filterLabel">שדות להצגה</span>
        <div className="documentTabs" aria-label="הצגת סיווגים לפי מסמך">
          <button
            type="button"
            aria-pressed={activeTemplateId === null}
            className={activeTemplateId === null ? "active" : ""}
            onClick={() => setActiveTemplateId(null)}
          >
            כל השדות
          </button>
          {allTemplates.map((template) => (
            <button
              type="button"
              aria-pressed={activeTemplateId === template.id}
              className={activeTemplateId === template.id ? "active" : ""}
              key={template.id}
              onClick={() => setActiveTemplateId(template.id)}
            >
              {template.displayName}
            </button>
          ))}
        </div>
        {activeTemplate && pendingFields.length === 0 && (
          <button
            type="button"
            className="sectionReset"
            disabled={resetClassifications.isPending || visibleFieldIds.size === 0}
            onClick={requestTemplateReset}
          >
            איפוס סיווגי המסמך
          </button>
        )}
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
          visibleFieldIds={visibleFieldIds}
          isSaving={approveClassifications.isPending}
          onApprove={(classifications) => approveClassifications.mutate(classifications)}
        />
      )}
      {pendingFields.length === 0 && approvedVisibleFields.length > 0 && (
        <ApprovedClassifications fields={approvedVisibleFields} onReset={requestFieldReset} />
      )}

      <ConfirmDialog
        open={resetRequest !== null}
        title={resetRequest?.title ?? "איפוס סיווגים"}
        description={resetRequest?.description ?? ""}
        confirmLabel={resetRequest?.confirmLabel ?? "איפוס"}
        tone="danger"
        onCancel={() => setResetRequest(null)}
        onConfirm={() => resetClassifications.mutate(resetRequest?.fieldIds)}
      />
    </section>
  );
}

function createDraft(field: FieldDefinition): ClassificationDraft {
  return {
    scope: field.scope ?? "",
    type: field.type,
    searchable: field.searchable,
    filterable: field.filterable,
  };
}

function draftsEqual(left: ClassificationDraft, right: ClassificationDraft): boolean {
  return (
    left.scope === right.scope &&
    left.type === right.type &&
    left.searchable === right.searchable &&
    left.filterable === right.filterable
  );
}

function ClassificationEditor({
  fields,
  visibleFieldIds,
  isSaving,
  onApprove,
}: {
  fields: FieldDefinition[];
  visibleFieldIds: Set<string>;
  isSaving: boolean;
  onApprove: (
    classifications: ({ id: string } & Omit<ClassificationDraft, "scope"> & {
        scope: FieldScope;
      })[],
  ) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, ClassificationDraft>>(() =>
    Object.fromEntries(fields.map((field) => [field._id, createDraft(field)])),
  );
  const [showApprovalConfirmation, setShowApprovalConfirmation] = useState(false);
  const [showDraftResetConfirmation, setShowDraftResetConfirmation] = useState(false);
  const displayedFields = fields.filter((field) => visibleFieldIds.has(field._id));
  const classifiedCount = fields.filter((field) => drafts[field._id]?.scope).length;
  const allClassified = classifiedCount === fields.length;
  const draftChanged = (field: FieldDefinition): boolean => {
    const draft = drafts[field._id];
    return draft ? !draftsEqual(draft, createDraft(field)) : false;
  };
  const displayedDraftsDirty = displayedFields.some(draftChanged);

  const updateDraft = (fieldId: string, update: Partial<ClassificationDraft>): void => {
    setDrafts((current) => ({
      ...current,
      [fieldId]: { ...current[fieldId]!, ...update },
    }));
  };
  const resetDraft = (field: FieldDefinition): void => {
    setDrafts((current) => ({ ...current, [field._id]: createDraft(field) }));
  };
  const resetDisplayedDrafts = (): void => {
    setDrafts((current) => ({
      ...current,
      ...Object.fromEntries(displayedFields.map((field) => [field._id, createDraft(field)])),
    }));
    setShowDraftResetConfirmation(false);
  };
  const approve = (): void => {
    const classifications = fields.flatMap((field) => {
      const draft = drafts[field._id];
      return draft?.scope ? [{ id: field._id, ...draft, scope: draft.scope }] : [];
    });
    if (classifications.length !== fields.length) return;
    onApprove(classifications);
    setShowApprovalConfirmation(false);
  };

  return (
    <div className="classificationEditor">
      <div className="classificationProgressRow">
        <div className="classificationProgress" aria-live="polite">
          סווגו {classifiedCount} מתוך {fields.length} שדות
          {displayedFields.length !== fields.length && ` · מוצגים כעת ${displayedFields.length}`}
        </div>
        {displayedFields.length > 0 && (
          <button
            type="button"
            className="sectionReset"
            disabled={!displayedDraftsDirty}
            onClick={() => setShowDraftResetConfirmation(true)}
          >
            שחזור השדות המוצגים
          </button>
        )}
      </div>
      {displayedFields.length === 0 ? (
        <div className="card empty">אין שדות הממתינים לסיווג במסמך זה.</div>
      ) : (
        displayedFields.map((field) => {
          const draft = drafts[field._id]!;
          return (
            <div className="card classification" key={field._id}>
              <div className="classificationIdentity">
                <strong>{field.label}</strong>
                <small dir="ltr">{field.key}</small>
                <button
                  type="button"
                  className="fieldResetButton"
                  disabled={!draftChanged(field)}
                  onClick={() => resetDraft(field)}
                >
                  שחזור
                </button>
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
        })
      )}
      <div className="classificationActions">
        <div>
          {!allClassified && <span>יש לבחור שיוך לכל השדות לפני האישור.</span>}
          {displayedFields.length !== fields.length && (
            <small>האישור כולל גם שדות ממתינים ממסמכים אחרים.</small>
          )}
        </div>
        <button
          type="button"
          className="primary"
          disabled={!allClassified || isSaving}
          onClick={() => setShowApprovalConfirmation(true)}
        >
          {isSaving ? "שומר סיווגים…" : "אישור ושמירת כל הסיווגים"}
        </button>
      </div>
      <ConfirmDialog
        open={showDraftResetConfirmation}
        title="לשחזר את השדות המוצגים?"
        description="בחירות הסיווג שטרם נשמרו בשדות המוצגים יחזרו לערכים המקוריים שלהן."
        confirmLabel="שחזור השדות"
        tone="danger"
        onCancel={() => setShowDraftResetConfirmation(false)}
        onConfirm={resetDisplayedDrafts}
      />
      <ConfirmDialog
        open={showApprovalConfirmation}
        title="לאשר את כל הסיווגים?"
        description={`הסיווג של כל ${fields.length} השדות הממתינים יישמר וישמש בהפקת המסמכים.`}
        confirmLabel="אישור ושמירה"
        onCancel={() => setShowApprovalConfirmation(false)}
        onConfirm={approve}
      />
    </div>
  );
}

function ApprovedClassifications({
  fields,
  onReset,
}: {
  fields: FieldDefinition[];
  onReset: (field: FieldDefinition) => void;
}) {
  return (
    <div className="approvedClassifications">
      <h3>סיווגים מאושרים</h3>
      <div className="approvedClassificationList">
        {fields.map((field) => (
          <article key={field._id} className="approvedClassificationRow">
            <div>
              <strong>{field.label}</strong>
              <small dir="ltr">{field.key}</small>
            </div>
            <span>{field.scope ? scopeLabels[field.scope] : "ללא שיוך"}</span>
            <span>{typeLabels[field.type]}</span>
            <button type="button" className="sectionReset" onClick={() => onReset(field)}>
              איפוס סיווג
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

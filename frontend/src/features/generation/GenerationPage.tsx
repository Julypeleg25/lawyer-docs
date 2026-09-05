import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  useFieldArray,
  useForm,
  type FieldArrayWithId,
  type FieldErrors,
  type FieldPath,
  type UseFormRegister,
} from "react-hook-form";
import { z } from "zod";
import { api, ApiError, download } from "../../shared/api";
import { ConfirmDialog } from "../../shared/ConfirmDialog";
import { requirementsSchema, templateSchema, type FieldRequirement } from "../../types";
import { DynamicField } from "./DynamicField";

interface FormData {
  buyers: { values: Record<string, string> }[];
  sellers: { values: Record<string, string> }[];
  property: { values: Record<string, string> };
  transactionValues: Record<string, string>;
}
type PartyPrefix = "buyers" | "sellers";
type PartyItem = FieldArrayWithId<FormData, PartyPrefix, "id">;
type PendingAction =
  | { type: "reset" }
  | { type: "templates"; selection: string[] }
  | { type: "removeParty"; prefix: PartyPrefix; index: number };

const templateListSchema = z.array(templateSchema);
const errorMessages: Record<string, string> = {
  MISSING_FIELDS: "יש להשלים את שדות החובה.",
  TEMPLATE_INVALID: "אחת התבניות דורשת תיקון.",
  TEMPLATE_CHANGED: "רשימת התבניות השתנתה. יש לרענן.",
  UNCLASSIFIED_FIELD: "יש לסווג את השדות החדשים לפני ההפקה.",
};

const createDefaultValues = (): FormData => ({
  buyers: [{ values: {} }],
  sellers: [{ values: {} }],
  property: { values: {} },
  transactionValues: {},
});

export function GenerationPage({ onDirtyChange }: { onDirtyChange: (isDirty: boolean) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [serverError, setServerError] = useState("");
  const [isCurrentDraftGenerated, setIsCurrentDraftGenerated] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: () => api("/templates", templateListSchema),
  });
  const requirements = useQuery({
    queryKey: ["requirements", selected],
    queryFn: () =>
      api("/generation/requirements", requirementsSchema, {
        method: "POST",
        body: JSON.stringify({ templateIds: selected }),
      }),
    enabled: selected.length > 0,
  });
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
    getValues,
    reset,
  } = useForm<FormData>({
    defaultValues: createDefaultValues(),
  });
  const buyers = useFieldArray({ control, name: "buyers" });
  const sellers = useFieldArray({ control, name: "sellers" });
  const hasDraftChanges = selected.length > 0 && (!isCurrentDraftGenerated || isDirty);

  useEffect(() => {
    onDirtyChange(hasDraftChanges);
  }, [hasDraftChanges, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!hasDraftChanges) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasDraftChanges]);

  const generation = useMutation({
    mutationFn: (data: FormData) =>
      download("/generation/generate", { templateIds: selected, ...data }),
    onError: (error) =>
      setServerError(
        error instanceof ApiError
          ? (errorMessages[error.code] ?? "ההפקה נכשלה. נסו שוב.")
          : "ההפקה נכשלה. נסו שוב.",
      ),
    onSuccess: (_result, submittedValues) => {
      setServerError("");
      reset(submittedValues);
      setIsCurrentDraftGenerated(true);
    },
  });
  const req = requirements.data;
  const applyTemplateSelection = (nextSelection: string[]): void => {
    setSelected(nextSelection);
    setServerError("");
    setIsCurrentDraftGenerated(false);
    generation.reset();
  };
  const updateTemplateSelection = (nextSelection: string[]): void => {
    if (isDirty) {
      setPendingAction({ type: "templates", selection: nextSelection });
      return;
    }
    applyTemplateSelection(nextSelection);
  };
  const applyReset = (): void => {
    reset(createDefaultValues());
    setSelected([]);
    setServerError("");
    setIsCurrentDraftGenerated(false);
    generation.reset();
  };
  const resetForm = (): void => {
    if (hasDraftChanges || selected.length > 0) {
      setPendingAction({ type: "reset" });
      return;
    }
    applyReset();
  };
  const applyRemoveParty = (prefix: PartyPrefix, index: number): void => {
    if (prefix === "buyers") buyers.remove(index);
    else sellers.remove(index);
  };
  const removeParty = (prefix: PartyPrefix, index: number): void => {
    const partyValues = getValues(`${prefix}.${index}.values`);
    if (Object.values(partyValues).some((value) => value !== "")) {
      setPendingAction({ type: "removeParty", prefix, index });
      return;
    }
    applyRemoveParty(prefix, index);
  };
  const confirmPendingAction = (): void => {
    if (!pendingAction) return;
    if (pendingAction.type === "reset") applyReset();
    if (pendingAction.type === "templates") applyTemplateSelection(pendingAction.selection);
    if (pendingAction.type === "removeParty") {
      applyRemoveParty(pendingAction.prefix, pendingAction.index);
    }
    setPendingAction(null);
  };

  const confirmationCopy =
    pendingAction?.type === "reset"
      ? {
          title: "לאפס את הטופס?",
          description: "כל המידע שהוזן ובחירת המסמכים יימחקו ולא ניתן יהיה לשחזר אותם.",
          confirmLabel: "איפוס הטופס",
        }
      : pendingAction?.type === "templates"
        ? {
            title: "לשנות את בחירת המסמכים?",
            description: "שינוי המסמכים עשוי לשנות את שדות החובה. המידע שכבר הוזן יישאר בטופס.",
            confirmLabel: "שינוי המסמכים",
          }
        : {
            title: "להסיר את הצד?",
            description: "הפרטים שהוזנו עבור צד זה יימחקו ולא ניתן יהיה לשחזר אותם.",
            confirmLabel: "הסרת הצד",
          };

  return (
    <section className="generationPage">
      <div className="pageTitle">
        <div>
          <p className="eyebrow">מסמך חדש</p>
          <h1>הפקת מסמכים</h1>
          <p>בחרו מסמכים, מלאו את פרטי הצדדים והעסקה, והפיקו קובץ להורדה.</p>
        </div>
        <div className="pageTitleActions">
          {hasDraftChanges && <span className="draftIndicator">קיימת טיוטה שטרם הופקה</span>}
          <button
            type="button"
            className="secondary"
            disabled={!isDirty && selected.length === 0}
            onClick={resetForm}
          >
            איפוס טופס
          </button>
        </div>
      </div>
      {(serverError || Object.keys(errors).length > 0) && (
        <div className="errorPanel" role="alert">
          <strong>לא ניתן להפיק את המסמכים</strong>
          <p>{serverError || "יש להשלים את השדות המסומנים."}</p>
        </div>
      )}
      <div className="card">
        <div className="sectionHeading">
          <div>
            <span className="step">1</span>
            <h2>בחירת מסמכים</h2>
          </div>
          <button
            type="button"
            className="link"
            onClick={() =>
              updateTemplateSelection(
                selected.length === (templates.data?.filter((t) => t.valid).length ?? 0)
                  ? []
                  : (templates.data?.filter((t) => t.valid).map((t) => t.id) ?? []),
              )
            }
          >
            בחירת כל המסמכים
          </button>
        </div>
        {templates.isLoading ? (
          <p>טוען תבניות…</p>
        ) : templates.data?.length === 0 ? (
          <div className="empty">
            <strong>לא נמצאו תבניות מסמכים</strong>
            <p>יש להוסיף קבצי DOCX לתיקיית templates של המערכת ולהעלות את השינויים ל-Git.</p>
          </div>
        ) : (
          <div className="templateGrid">
            {templates.data?.map((t) => (
              <label
                className={`choice ${selected.includes(t.id) ? "selected" : ""} ${!t.valid ? "disabled" : ""}`}
                key={t.id}
              >
                <input
                  type="checkbox"
                  disabled={!t.valid}
                  checked={selected.includes(t.id)}
                  onChange={() =>
                    updateTemplateSelection(
                      selected.includes(t.id)
                        ? selected.filter((id) => id !== t.id)
                        : [...selected, t.id],
                    )
                  }
                />
                <span>
                  <strong>{t.displayName}</strong>
                  <small dir="ltr">{t.filename}</small>
                  {!t.valid && <small>דורש תיקון</small>}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
      {selected.length > 0 && requirements.isLoading && (
        <div className="infoPanel">טוען את השדות הנדרשים למסמכים שנבחרו…</div>
      )}
      {requirements.error && (
        <div className="errorPanel">
          {requirements.error instanceof ApiError
            ? (errorMessages[requirements.error.code] ?? "לא ניתן לטעון את דרישות התבנית.")
            : "לא ניתן לטעון את דרישות התבנית."}
        </div>
      )}
      {req && (
        <form onSubmit={handleSubmit((data) => generation.mutate(data))}>
          <PartySection
            title="קונים"
            step="2"
            singular="קונה"
            items={buyers.fields}
            append={() => buyers.append({ values: {} })}
            remove={(index) => removeParty("buyers", index)}
            fields={req.buyerFields}
            prefix="buyers"
            register={register}
            errors={errors}
          />
          <PartySection
            title="מוכרים"
            step="3"
            singular="מוכר"
            items={sellers.fields}
            append={() => sellers.append({ values: {} })}
            remove={(index) => removeParty("sellers", index)}
            fields={req.sellerFields}
            prefix="sellers"
            register={register}
            errors={errors}
          />
          <div className="card">
            <div className="sectionHeading">
              <div>
                <span className="step">4</span>
                <h2>נכס</h2>
              </div>
            </div>
            <div className="fields">
              {req.propertyFields.map((f) => (
                <DynamicField
                  key={f.key}
                  field={f}
                  name={`property.values.${f.key}`}
                  register={register}
                  error={errors.property?.values?.[f.key]?.message}
                />
              ))}
            </div>
          </div>
          <div className="card">
            <div className="sectionHeading">
              <div>
                <span className="step">5</span>
                <h2>פרטי העסקה</h2>
              </div>
            </div>
            <div className="fields">
              {req.transactionFields.map((f) => (
                <DynamicField
                  key={f.key}
                  field={f}
                  name={`transactionValues.${f.key}`}
                  register={register}
                  error={errors.transactionValues?.[f.key]?.message}
                />
              ))}
            </div>
          </div>
          <div className="generationActions">
            <div>
              <strong>הפקה והורדה</strong>
              <span>הקבצים יורדו למחשב ואינם נשמרים במערכת.</span>
            </div>
            <div>
              <button type="button" className="secondary" onClick={resetForm}>
                איפוס טופס
              </button>
              <button className="primary" type="submit" disabled={generation.isPending}>
                {generation.isPending ? "מפיק מסמכים…" : "הפקת מסמכים והורדה"}
              </button>
            </div>
          </div>
        </form>
      )}
      <ConfirmDialog
        open={pendingAction !== null}
        title={confirmationCopy.title}
        description={confirmationCopy.description}
        confirmLabel={confirmationCopy.confirmLabel}
        tone="danger"
        onCancel={() => setPendingAction(null)}
        onConfirm={confirmPendingAction}
      />
    </section>
  );
}

interface PartySectionProps {
  title: string;
  step: string;
  singular: string;
  items: PartyItem[];
  append: () => void;
  remove: (index: number) => void;
  fields: FieldRequirement[];
  prefix: PartyPrefix;
  register: UseFormRegister<FormData>;
  errors: FieldErrors<FormData>;
}

function PartySection({
  title,
  step,
  singular,
  items,
  append,
  remove,
  fields,
  prefix,
  register,
  errors,
}: PartySectionProps) {
  return (
    <div className="card">
      <div className="sectionHeading">
        <div>
          <span className="step">{step}</span>
          <h2>{title}</h2>
        </div>
        <button type="button" className="secondary" onClick={append}>
          הוספת {singular}
        </button>
      </div>
      {items.map((item, index) => (
        <div className="party" key={item.id}>
          <div className="partyTitle">
            <h3>
              {singular} {index + 1}
            </h3>
            {items.length > 1 && (
              <button type="button" className="dangerLink" onClick={() => remove(index)}>
                הסרה
              </button>
            )}
          </div>
          <div className="fields">
            {fields.map((field) => {
              const name = `${prefix}.${index}.values.${field.key}` as FieldPath<FormData>;
              const error = errors[prefix]?.[index]?.values?.[field.key]?.message;
              return (
                <DynamicField
                  key={field.key}
                  field={field}
                  name={name}
                  register={register}
                  error={error}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

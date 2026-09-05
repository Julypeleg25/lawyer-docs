import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
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

type FormValue = string | boolean;
interface FormData {
  buyers: { values: Record<string, FormValue> }[];
  sellers: { values: Record<string, FormValue> }[];
  property: { values: Record<string, FormValue> };
  transactionValues: Record<string, FormValue>;
}
type PartyPrefix = "buyers" | "sellers";
type PartyItem = FieldArrayWithId<FormData, PartyPrefix, "id">;
type FormValuePath =
  | `buyers.${number}.values.${string}`
  | `sellers.${number}.values.${string}`
  | `property.values.${string}`
  | `transactionValues.${string}`;
interface ClearTarget {
  path: FormValuePath;
  emptyValue: FormValue;
}
interface ConfirmationCopy {
  title: string;
  description: string;
  confirmLabel: string;
}
type PendingAction =
  | { type: "reset" }
  | { type: "templates"; selection: string[] }
  | { type: "removeParty"; prefix: PartyPrefix; index: number }
  | { type: "clearFields"; targets: ClearTarget[]; copy: ConfirmationCopy };

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
const hasEnteredValue = (value: FormValue | undefined): boolean =>
  value !== undefined && value !== "" && value !== false;

export function GenerationPage({ onDirtyChange }: { onDirtyChange: (isDirty: boolean) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [serverError, setServerError] = useState("");
  const [isCurrentDraftGenerated, setIsCurrentDraftGenerated] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
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
    formState: { dirtyFields, errors, isDirty },
    getValues,
    reset,
    setValue,
  } = useForm<FormData>({
    defaultValues: createDefaultValues(),
  });
  const buyers = useFieldArray({ control, name: "buyers" });
  const sellers = useFieldArray({ control, name: "sellers" });
  const currentValues = useWatch({ control });
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
  const selectedTemplates =
    templates.data?.filter((template) => selected.includes(template.id)) ?? [];
  const activeTemplate = activeTemplateId
    ? selectedTemplates.find((template) => template.id === activeTemplateId)
    : undefined;
  const visibleFields = (fields: FieldRequirement[]): FieldRequirement[] =>
    activeTemplateId
      ? fields.filter((field) => field.requiredByTemplateIds.includes(activeTemplateId))
      : fields;
  const applyTemplateSelection = (nextSelection: string[]): void => {
    setSelected(nextSelection);
    setActiveTemplateId((current) => (current && nextSelection.includes(current) ? current : null));
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
    if (Object.values(partyValues).some(hasEnteredValue)) {
      setPendingAction({ type: "removeParty", prefix, index });
      return;
    }
    applyRemoveParty(prefix, index);
  };
  const createClearTarget = (path: FormValuePath, field: FieldRequirement): ClearTarget => ({
    path,
    emptyValue: field.type === "boolean" ? false : "",
  });
  const createSectionTargets = (
    section: "buyers" | "sellers" | "property" | "transaction",
    fields: FieldRequirement[],
  ): ClearTarget[] => {
    if (section === "buyers") {
      return buyers.fields.flatMap((_buyer, index) =>
        fields.map((field) => createClearTarget(`buyers.${index}.values.${field.key}`, field)),
      );
    }
    if (section === "sellers") {
      return sellers.fields.flatMap((_seller, index) =>
        fields.map((field) => createClearTarget(`sellers.${index}.values.${field.key}`, field)),
      );
    }
    if (section === "property") {
      return fields.map((field) => createClearTarget(`property.values.${field.key}`, field));
    }
    return fields.map((field) => createClearTarget(`transactionValues.${field.key}`, field));
  };
  const sectionCanClear = (
    section: "buyers" | "sellers" | "property" | "transaction",
    fields: FieldRequirement[],
  ): boolean => {
    if (section === "buyers") {
      return (
        currentValues.buyers?.some((party, index) =>
          fields.some(
            (field) =>
              Boolean(dirtyFields.buyers?.[index]?.values?.[field.key]) &&
              hasEnteredValue(party?.values?.[field.key]),
          ),
        ) ?? false
      );
    }
    if (section === "sellers") {
      return (
        currentValues.sellers?.some((party, index) =>
          fields.some(
            (field) =>
              Boolean(dirtyFields.sellers?.[index]?.values?.[field.key]) &&
              hasEnteredValue(party?.values?.[field.key]),
          ),
        ) ?? false
      );
    }
    if (section === "property") {
      return fields.some(
        (field) =>
          Boolean(dirtyFields.property?.values?.[field.key]) &&
          hasEnteredValue(currentValues.property?.values?.[field.key]),
      );
    }
    return fields.some(
      (field) =>
        Boolean(dirtyFields.transactionValues?.[field.key]) &&
        hasEnteredValue(currentValues.transactionValues?.[field.key]),
    );
  };
  const requestClearFields = (targets: ClearTarget[], copy: ConfirmationCopy): void => {
    const populatedTargets = targets.filter(({ path }) => {
      const value = getValues(path);
      return hasEnteredValue(value);
    });
    if (populatedTargets.length === 0) return;
    setPendingAction({ type: "clearFields", targets: populatedTargets, copy });
  };
  const requestSectionReset = (
    section: "buyers" | "sellers" | "property" | "transaction",
    label: string,
    fields: FieldRequirement[],
  ): void => {
    requestClearFields(createSectionTargets(section, fields), {
      title: `לנקות את אזור ${label}?`,
      description: "רק הנתונים באזור זה יימחקו. בחירת המסמכים ושאר הטופס יישארו ללא שינוי.",
      confirmLabel: "ניקוי האזור",
    });
  };
  const requestFieldReset = (target: ClearTarget, label: string): void => {
    requestClearFields([target], {
      title: `לנקות את השדה „${label}”?`,
      description: "הערך בשדה זה בלבד יימחק. יתר הטופס יישאר ללא שינוי.",
      confirmLabel: "ניקוי השדה",
    });
  };
  const requestDocumentReset = (): void => {
    if (!req) return;
    const buyerFields = visibleFields(req.buyerFields);
    const sellerFields = visibleFields(req.sellerFields);
    const propertyFields = visibleFields(req.propertyFields);
    const transactionFields = visibleFields(req.transactionFields);
    const targets = [
      ...createSectionTargets("buyers", buyerFields),
      ...createSectionTargets("sellers", sellerFields),
      ...createSectionTargets("property", propertyFields),
      ...createSectionTargets("transaction", transactionFields),
    ];
    requestClearFields(targets, {
      title: activeTemplate
        ? `לנקות את שדות „${activeTemplate.displayName}”?`
        : "לנקות את כל השדות?",
      description: activeTemplate
        ? "כל הערכים המשמשים מסמך זה יימחקו. שדות משותפים עשויים להידרש גם במסמכים אחרים."
        : "כל הערכים שהוזנו יימחקו, אך בחירת המסמכים תישאר ללא שינוי.",
      confirmLabel: activeTemplate ? "ניקוי שדות המסמך" : "ניקוי כל השדות",
    });
  };
  const documentCanClear = req
    ? sectionCanClear("buyers", visibleFields(req.buyerFields)) ||
      sectionCanClear("sellers", visibleFields(req.sellerFields)) ||
      sectionCanClear("property", visibleFields(req.propertyFields)) ||
      sectionCanClear("transaction", visibleFields(req.transactionFields))
    : false;
  const confirmPendingAction = (): void => {
    if (!pendingAction) return;
    if (pendingAction.type === "reset") applyReset();
    if (pendingAction.type === "templates") applyTemplateSelection(pendingAction.selection);
    if (pendingAction.type === "removeParty") {
      applyRemoveParty(pendingAction.prefix, pendingAction.index);
    }
    if (pendingAction.type === "clearFields") {
      for (const target of pendingAction.targets) {
        setValue(target.path, target.emptyValue, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
      setServerError("");
      setIsCurrentDraftGenerated(false);
      generation.reset();
    }
    setPendingAction(null);
  };

  const confirmationCopy: ConfirmationCopy =
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
        : pendingAction?.type === "clearFields"
          ? pendingAction.copy
          : {
              title: "להסיר את הצד?",
              description: "הפרטים שהוזנו עבור צד זה יימחקו ולא ניתן יהיה לשחזר אותם.",
              confirmLabel: "הסרת הצד",
            };

  return (
    <section className="generationPage">
      <div className="pageTitle">
        <div>
          <h1>הפקת מסמכים</h1>
          <p>בחרו מסמכים והשלימו את הפרטים הנדרשים.</p>
        </div>
        <div className="pageTitleActions">
          {hasDraftChanges && <span className="draftIndicator">קיימת טיוטה שטרם הופקה</span>}
          <button
            type="button"
            className="secondary"
            disabled={!isDirty && selected.length === 0}
            onClick={resetForm}
          >
            איפוס מלא
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
        <form
          onSubmit={handleSubmit(
            (data) => generation.mutate(data),
            () => setActiveTemplateId(null),
          )}
        >
          <div className="documentFilterBar">
            <span className="filterLabel">שדות להצגה</span>
            <div className="documentTabs" aria-label="הצגת שדות לפי מסמך">
              <button
                type="button"
                aria-pressed={activeTemplateId === null}
                className={activeTemplateId === null ? "active" : ""}
                onClick={() => setActiveTemplateId(null)}
              >
                כל המסמכים
              </button>
              {selectedTemplates.map((template) => (
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
            <button
              type="button"
              className="sectionReset"
              disabled={!documentCanClear}
              onClick={requestDocumentReset}
            >
              {activeTemplate ? "ניקוי שדות המסמך" : "ניקוי השדות"}
            </button>
          </div>
          <PartySection
            title="קונים"
            singular="קונה"
            items={buyers.fields}
            append={() => buyers.append({ values: {} })}
            remove={(index) => removeParty("buyers", index)}
            fields={visibleFields(req.buyerFields)}
            prefix="buyers"
            register={register}
            control={control}
            errors={errors}
            canReset={sectionCanClear("buyers", visibleFields(req.buyerFields))}
            isFieldDirty={(index, key) => Boolean(dirtyFields.buyers?.[index]?.values?.[key])}
            onReset={(fields) => requestSectionReset("buyers", "קונים", fields)}
            onClearField={(path, field) =>
              requestFieldReset(createClearTarget(path, field), field.label)
            }
          />
          <PartySection
            title="מוכרים"
            singular="מוכר"
            items={sellers.fields}
            append={() => sellers.append({ values: {} })}
            remove={(index) => removeParty("sellers", index)}
            fields={visibleFields(req.sellerFields)}
            prefix="sellers"
            register={register}
            control={control}
            errors={errors}
            canReset={sectionCanClear("sellers", visibleFields(req.sellerFields))}
            isFieldDirty={(index, key) => Boolean(dirtyFields.sellers?.[index]?.values?.[key])}
            onReset={(fields) => requestSectionReset("sellers", "מוכרים", fields)}
            onClearField={(path, field) =>
              requestFieldReset(createClearTarget(path, field), field.label)
            }
          />
          {visibleFields(req.propertyFields).length > 0 && (
            <div className="card">
              <div className="sectionHeading">
                <div>
                  <h2>נכס</h2>
                </div>
                <button
                  type="button"
                  className="sectionReset"
                  disabled={!sectionCanClear("property", visibleFields(req.propertyFields))}
                  onClick={() =>
                    requestSectionReset("property", "נכס", visibleFields(req.propertyFields))
                  }
                >
                  ניקוי אזור
                </button>
              </div>
              <div className="fields">
                {visibleFields(req.propertyFields).map((f) => (
                  <DynamicField
                    key={f.key}
                    field={f}
                    name={`property.values.${f.key}`}
                    register={register}
                    control={control}
                    dirty={Boolean(dirtyFields.property?.values?.[f.key])}
                    error={errors.property?.values?.[f.key]?.message}
                    onClear={() =>
                      requestFieldReset(createClearTarget(`property.values.${f.key}`, f), f.label)
                    }
                  />
                ))}
              </div>
            </div>
          )}
          {visibleFields(req.transactionFields).length > 0 && (
            <div className="card">
              <div className="sectionHeading">
                <div>
                  <h2>פרטי העסקה</h2>
                </div>
                <button
                  type="button"
                  className="sectionReset"
                  disabled={!sectionCanClear("transaction", visibleFields(req.transactionFields))}
                  onClick={() =>
                    requestSectionReset(
                      "transaction",
                      "פרטי העסקה",
                      visibleFields(req.transactionFields),
                    )
                  }
                >
                  ניקוי אזור
                </button>
              </div>
              <div className="fields">
                {visibleFields(req.transactionFields).map((f) => (
                  <DynamicField
                    key={f.key}
                    field={f}
                    name={`transactionValues.${f.key}`}
                    register={register}
                    control={control}
                    dirty={Boolean(dirtyFields.transactionValues?.[f.key])}
                    error={errors.transactionValues?.[f.key]?.message}
                    onClear={() =>
                      requestFieldReset(createClearTarget(`transactionValues.${f.key}`, f), f.label)
                    }
                  />
                ))}
              </div>
            </div>
          )}
          <div className="generationActions">
            <div>
              <span>הקבצים יורדו למחשב ואינם נשמרים במערכת.</span>
            </div>
            <div>
              <button type="button" className="secondary" onClick={resetForm}>
                איפוס מלא
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
  singular: string;
  items: PartyItem[];
  append: () => void;
  remove: (index: number) => void;
  fields: FieldRequirement[];
  prefix: PartyPrefix;
  register: UseFormRegister<FormData>;
  control: Control<FormData>;
  errors: FieldErrors<FormData>;
  canReset: boolean;
  isFieldDirty: (index: number, key: string) => boolean;
  onReset: (fields: FieldRequirement[]) => void;
  onClearField: (path: FormValuePath, field: FieldRequirement) => void;
}

function PartySection({
  title,
  singular,
  items,
  append,
  remove,
  fields,
  prefix,
  register,
  control,
  errors,
  canReset,
  isFieldDirty,
  onReset,
  onClearField,
}: PartySectionProps) {
  if (fields.length === 0) return null;

  return (
    <div className="card">
      <div className="sectionHeading">
        <div>
          <h2>{title}</h2>
        </div>
        <div className="sectionActions">
          <button
            type="button"
            className="sectionReset"
            disabled={!canReset}
            onClick={() => onReset(fields)}
          >
            ניקוי אזור
          </button>
          <button type="button" className="secondary" onClick={append}>
            הוספת {singular}
          </button>
        </div>
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
                  control={control}
                  dirty={isFieldDirty(index, field.key)}
                  error={error}
                  onClear={() => onClearField(name as FormValuePath, field)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

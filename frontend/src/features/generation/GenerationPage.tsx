import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  useFieldArray,
  useForm,
  type FieldArrayWithId,
  type FieldErrors,
  type FieldPath,
  type UseFieldArrayRemove,
  type UseFormRegister,
} from "react-hook-form";
import { z } from "zod";
import { api, ApiError, download } from "../../shared/api";
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

const templateListSchema = z.array(templateSchema);
const errorMessages: Record<string, string> = {
  MISSING_FIELDS: "יש להשלים את שדות החובה.",
  TEMPLATE_INVALID: "אחת התבניות דורשת תיקון.",
  TEMPLATE_CHANGED: "רשימת התבניות השתנתה. יש לרענן.",
  UNCLASSIFIED_FIELD: "יש לסווג את השדות החדשים לפני ההפקה.",
};

export function GenerationPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [serverError, setServerError] = useState("");
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
    formState: { errors },
    reset,
  } = useForm<FormData>({
    defaultValues: {
      buyers: [{ values: {} }],
      sellers: [{ values: {} }],
      property: { values: {} },
      transactionValues: {},
    },
  });
  const buyers = useFieldArray({ control, name: "buyers" });
  const sellers = useFieldArray({ control, name: "sellers" });
  const selectionKey = selected.join("|");
  useEffect(() => {
    reset({
      buyers: [{ values: {} }],
      sellers: [{ values: {} }],
      property: { values: {} },
      transactionValues: {},
    });
  }, [selectionKey, reset]);
  const generation = useMutation({
    mutationFn: (data: FormData) =>
      download("/generation/generate", { templateIds: selected, ...data }),
    onError: (error) =>
      setServerError(
        error instanceof ApiError
          ? (errorMessages[error.code] ?? "ההפקה נכשלה. נסו שוב.")
          : "ההפקה נכשלה. נסו שוב.",
      ),
    onSuccess: () => setServerError(""),
  });
  const req = requirements.data;
  return (
    <section>
      <div className="pageTitle">
        <div>
          <p className="eyebrow">מסמך חדש</p>
          <h1>הפקת מסמכים</h1>
          <p>בחרו תבניות והשלימו פעם אחת את פרטי העסקה.</p>
        </div>
        <button
          className="primary"
          disabled={!selected.length || generation.isPending}
          onClick={handleSubmit((data) => generation.mutate(data))}
        >
          {generation.isPending ? "מפיק מסמכים…" : "הפקת מסמכים"}
        </button>
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
            className="link"
            onClick={() =>
              setSelected(
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
              <label className={`choice ${!t.valid ? "disabled" : ""}`} key={t.id}>
                <input
                  type="checkbox"
                  disabled={!t.valid}
                  checked={selected.includes(t.id)}
                  onChange={() =>
                    setSelected((v) =>
                      v.includes(t.id) ? v.filter((id) => id !== t.id) : [...v, t.id],
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
            remove={buyers.remove}
            fields={req.personFields}
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
            remove={sellers.remove}
            fields={req.personFields}
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
          <button className="primary wide" type="submit" disabled={generation.isPending}>
            הפקת מסמכים והורדה
          </button>
        </form>
      )}
    </section>
  );
}

interface PartySectionProps {
  title: string;
  step: string;
  singular: string;
  items: PartyItem[];
  append: () => void;
  remove: UseFieldArrayRemove;
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

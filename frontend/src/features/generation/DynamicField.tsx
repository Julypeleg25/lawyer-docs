import type { FieldRequirement } from "../../types";
import { useId } from "react";
import type { FieldPath, FieldValues, UseFormRegister } from "react-hook-form";

interface DynamicFieldProps<TFormValues extends FieldValues> {
  field: FieldRequirement;
  name: FieldPath<TFormValues>;
  register: UseFormRegister<TFormValues>;
  error?: string | undefined;
  onClear?: (() => void) | undefined;
}

export function DynamicField<TFormValues extends FieldValues>({
  field,
  name,
  register,
  error,
  onClear,
}: DynamicFieldProps<TFormValues>) {
  const inputId = useId();
  const rules = field.required ? { required: "שדה חובה" } : undefined;
  const ltr = ["idNumber", "number", "money", "percentage", "date"].includes(field.type);
  return (
    <div className={error ? "field invalid" : "field"}>
      <div className="fieldHeader">
        <label htmlFor={inputId}>
          {field.label}
          {field.required && <em> *</em>}
        </label>
        {onClear && (
          <button type="button" className="fieldClear" onClick={onClear}>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m7 7 10 10M17 7 7 17" />
            </svg>
            <span>ניקוי</span>
          </button>
        )}
      </div>
      {field.type === "textarea" ? (
        <textarea id={inputId} {...register(name, rules)} />
      ) : field.type === "boolean" ? (
        <input id={inputId} type="checkbox" {...register(name)} />
      ) : (
        <input
          id={inputId}
          dir={ltr ? "ltr" : "rtl"}
          type={
            field.type === "date"
              ? "date"
              : field.type === "number" || field.type === "money" || field.type === "percentage"
                ? "number"
                : "text"
          }
          {...register(name, rules)}
        />
      )}{" "}
      {error && <small>{error}</small>}
    </div>
  );
}

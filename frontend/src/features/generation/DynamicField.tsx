import type { FieldRequirement } from "../../types";
import { useId } from "react";
import { type FieldPath, type FieldValues, type UseFormRegister } from "react-hook-form";

interface DynamicFieldProps<TFormValues extends FieldValues> {
  field: FieldRequirement;
  name: FieldPath<TFormValues>;
  register: UseFormRegister<TFormValues>;
  error?: string | undefined;
}

export function DynamicField<TFormValues extends FieldValues>({
  field,
  name,
  register,
  error,
}: DynamicFieldProps<TFormValues>) {
  const inputId = useId();
  const rules = field.required ? { required: "שדה חובה" } : undefined;
  const ltr = ["idNumber", "number", "money", "percentage", "date"].includes(field.type);
  return (
    <div className={error ? "field invalid" : "field"}>
      <label htmlFor={inputId}>
        {field.label}
        {field.required && <em> *</em>}
      </label>
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

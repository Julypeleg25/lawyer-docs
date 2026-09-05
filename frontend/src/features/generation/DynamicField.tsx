import type { FieldRequirement } from "../../types";
import type { FieldPath, FieldValues, UseFormRegister } from "react-hook-form";

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
  const rules = field.required ? { required: "שדה חובה" } : undefined;
  const ltr = ["idNumber", "number", "money", "percentage", "date"].includes(field.type);
  return (
    <label className={error ? "field invalid" : "field"}>
      <span>
        {field.label}
        {field.required && <em> *</em>}
      </span>
      {field.type === "textarea" ? (
        <textarea {...register(name, rules)} />
      ) : field.type === "boolean" ? (
        <input type="checkbox" {...register(name)} />
      ) : (
        <input
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
    </label>
  );
}

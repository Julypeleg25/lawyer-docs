import type { FieldRequirement } from "../../types";
import type { UseFormRegister } from "react-hook-form";

export function DynamicField({
  field,
  name,
  register,
  error,
}: {
  field: FieldRequirement;
  name: string;
  register: UseFormRegister<any>;
  error?: string;
}) {
  const rules = field.required ? { required: "שדה חובה" } : undefined;
  const ltr = ["idNumber", "number", "money", "percentage", "date"].includes(
    field.type,
  );
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
              : field.type === "number" ||
                  field.type === "money" ||
                  field.type === "percentage"
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

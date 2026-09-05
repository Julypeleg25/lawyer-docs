import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "../../shared/api";
import { fieldDefinitionSchema, templateSchema } from "../../types";

const templateListSchema = z.array(templateSchema);
const fieldDefinitionListSchema = z.array(fieldDefinitionSchema);
type FieldScope = "person" | "property" | "transaction";

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
  const classify = useMutation({
    mutationFn: ({ id, scope }: { id: string; scope: FieldScope }) =>
      api(`/fields/${id}`, fieldDefinitionSchema, {
        method: "PATCH",
        body: JSON.stringify({ scope, type: "text" }),
      }),
    onSuccess: () => client.invalidateQueries(),
  });
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
      <h2 className="subTitle">שדות הממתינים לסיווג</h2>
      {fields.data?.filter((f) => !f.classified).length === 0 ? (
        <p className="muted">אין שדות שממתינים לסיווג.</p>
      ) : (
        fields.data
          ?.filter((f) => !f.classified)
          .map((f) => (
            <div className="card classification" key={f._id}>
              <div>
                <strong>נמצא שדה חדש</strong>
                <p>{f.label}</p>
              </div>
              <div>
                <span>שיוך:</span>
                <button onClick={() => classify.mutate({ id: f._id, scope: "person" })}>
                  לקוח
                </button>
                <button onClick={() => classify.mutate({ id: f._id, scope: "property" })}>
                  נכס
                </button>
                <button onClick={() => classify.mutate({ id: f._id, scope: "transaction" })}>
                  עסקה
                </button>
              </div>
            </div>
          ))
      )}
    </section>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { api } from "../../shared/api";
import { entitySchema } from "../../types";

export function EntitiesPage({ kind }: { kind: "customers" | "properties" }) {
  const [query, setQuery] = useState("");
  const isCustomers = kind === "customers";
  const result = useQuery({
    queryKey: [kind, query],
    queryFn: () => api(`/${kind}?q=${encodeURIComponent(query)}`, z.array(entitySchema)),
  });
  return (
    <section>
      <div className="pageTitle">
        <div>
          <h1>{isCustomers ? "לקוחות" : "נכסים"}</h1>
          <p>
            {isCustomers
              ? "איתור לקוחות לפי שם, תעודת זהות, טלפון ושדות שהוגדרו לחיפוש."
              : "איתור נכסים לפי כתובת ושדות שהוגדרו לחיפוש."}
          </p>
        </div>
      </div>
      <div className="card">
        <label className="search">
          <span>חיפוש</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isCustomers ? "שם, תעודת זהות או טלפון" : "כתובת, גוש או חלקה"}
          />
        </label>
        <div className="entityList">
          {result.data?.map((item) => (
            <article key={item._id}>
              <strong>{item.displayName}</strong>
              <div className="meta" dir="ltr">
                {isCustomers
                  ? [item.idNumber, item.phone].filter(Boolean).join(" · ")
                  : item.address}
              </div>
            </article>
          ))}
          {result.data?.length === 0 && <p className="muted">לא נמצאו תוצאות.</p>}
        </div>
      </div>
    </section>
  );
}

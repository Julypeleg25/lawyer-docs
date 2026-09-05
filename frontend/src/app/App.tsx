import { useState } from "react";
import { GenerationPage } from "../features/generation/GenerationPage";
import { TemplatesPage } from "../features/templates/TemplatesPage";
import { EntitiesPage } from "../features/entities/EntitiesPage";
import { TutorialPage } from "../features/tutorial/TutorialPage";

const tabs = [
  ["generation", "הפקת מסמכים"],
  ["customers", "לקוחות"],
  ["properties", "נכסים"],
  ["templates", "תבניות המסמכים"],
  ["tutorial", "מדריך"],
] as const;

export function App() {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("generation");
  return (
    <>
      <header>
        <div>
          <span className="brandMark">נפ</span>
          <strong>מערכת מסמכים משפטיים</strong>
        </div>
        <nav aria-label="ניווט ראשי">
          {tabs.map(([key, label]) => (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === "generation" && <GenerationPage />}
        {tab === "customers" && <EntitiesPage kind="customers" />}
        {tab === "properties" && <EntitiesPage kind="properties" />}
        {tab === "templates" && <TemplatesPage />}
        {tab === "tutorial" && <TutorialPage />}
      </main>
    </>
  );
}

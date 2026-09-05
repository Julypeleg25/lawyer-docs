import { useState } from "react";
import { GenerationPage } from "../features/generation/GenerationPage";
import { TemplatesPage } from "../features/templates/TemplatesPage";
import { EntitiesPage } from "../features/entities/EntitiesPage";
import { TutorialPage } from "../features/tutorial/TutorialPage";
import { ConfirmDialog } from "../shared/ConfirmDialog";

const tabs = [
  ["generation", "הפקת מסמכים", "ה"],
  ["customers", "לקוחות", "ל"],
  ["properties", "נכסים", "נ"],
  ["templates", "תבניות המסמכים", "ת"],
  ["tutorial", "מדריך", "?"],
] as const;

export function App() {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("generation");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingTab, setPendingTab] = useState<(typeof tabs)[number][0] | null>(null);

  const changeTab = (nextTab: (typeof tabs)[number][0]): void => {
    if (nextTab === tab) return;
    if (hasUnsavedChanges) {
      setPendingTab(nextTab);
      return;
    }
    setTab(nextTab);
  };

  const confirmNavigation = (): void => {
    if (!pendingTab) return;
    setHasUnsavedChanges(false);
    setTab(pendingTab);
    setPendingTab(null);
  };

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="sidebarBrand">
          <span className="brandMark">נפ</span>
          <div>
            <strong>מסמכים משפטיים</strong>
            <small>מערכת המשרד</small>
          </div>
        </div>
        <nav aria-label="ניווט ראשי">
          {tabs.map(([key, label, icon]) => (
            <button
              type="button"
              key={key}
              className={tab === key ? "active" : ""}
              aria-current={tab === key ? "page" : false}
              onClick={() => changeTab(key)}
            >
              <span className="navIcon" aria-hidden="true">
                {icon}
              </span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebarFooter">
          <span className="securityDot" aria-hidden="true" />
          <span>תבניות מאובטחות ב־Git פרטי</span>
        </div>
      </aside>
      <main className="appContent">
        {tab === "generation" && <GenerationPage onDirtyChange={setHasUnsavedChanges} />}
        {tab === "customers" && <EntitiesPage kind="customers" />}
        {tab === "properties" && <EntitiesPage kind="properties" />}
        {tab === "templates" && <TemplatesPage />}
        {tab === "tutorial" && <TutorialPage />}
      </main>
      <ConfirmDialog
        open={pendingTab !== null}
        title="לעזוב את הטופס?"
        description="קיימים שינויים שטרם הופקו. מעבר למסך אחר יבטל את הטיוטה הנוכחית."
        confirmLabel="לעזוב את הטופס"
        tone="danger"
        onCancel={() => setPendingTab(null)}
        onConfirm={confirmNavigation}
      />
    </div>
  );
}

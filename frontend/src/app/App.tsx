import { useState, type ReactNode } from "react";
import { GenerationPage } from "../features/generation/GenerationPage";
import { TemplatesPage } from "../features/templates/TemplatesPage";
import { EntitiesPage } from "../features/entities/EntitiesPage";
import { TutorialPage } from "../features/tutorial/TutorialPage";
import { ConfirmDialog } from "../shared/ConfirmDialog";

type NavigationIconName = "document" | "customers" | "property" | "templates" | "help" | "lock";

const tabs = [
  { key: "generation", label: "הפקת מסמכים", icon: "document" },
  { key: "customers", label: "לקוחות", icon: "customers" },
  { key: "properties", label: "נכסים", icon: "property" },
  { key: "templates", label: "תבניות המסמכים", icon: "templates" },
  { key: "tutorial", label: "מדריך", icon: "help" },
] as const satisfies readonly {
  key: string;
  label: string;
  icon: NavigationIconName;
}[];

type TabKey = (typeof tabs)[number]["key"];

function NavigationIcon({
  name,
  className = "navIcon",
}: {
  name: NavigationIconName;
  className?: string;
}) {
  const content = {
    document: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M12 18v-6M9 15h6" />
      </>
    ),
    customers: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    property: (
      <>
        <path d="M3 21h18M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" />
        <path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01" />
      </>
    ),
    templates: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
        <path d="M14 2v6h6M8 13h4M8 9h2M16 13h6M19 10v6" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.1 9a3 3 0 1 1 5.83 1c0 2-3 2-3 4M12 18h.01" />
      </>
    ),
    lock: (
      <>
        <rect width="16" height="11" x="4" y="11" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>
    ),
  } satisfies Record<NavigationIconName, ReactNode>;

  return (
    <svg
      className={className}
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {content[name]}
    </svg>
  );
}

function BrandIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v18M5 6h14M7 6l-4 8h8L7 6ZM17 6l-4 8h8l-4-8ZM8 21h8" />
    </svg>
  );
}

export function App() {
  const [tab, setTab] = useState<TabKey>("generation");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingTab, setPendingTab] = useState<TabKey | null>(null);

  const changeTab = (nextTab: TabKey): void => {
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
          <span className="brandMark">
            <BrandIcon />
          </span>
          <div>
            <strong>מסמכים משפטיים</strong>
            <small>מערכת המשרד</small>
          </div>
        </div>
        <nav aria-label="ניווט ראשי">
          {tabs.map(({ key, label, icon }) => (
            <button
              type="button"
              key={key}
              className={tab === key ? "active" : ""}
              aria-current={tab === key ? "page" : false}
              onClick={() => changeTab(key)}
            >
              <NavigationIcon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebarFooter">
          <NavigationIcon name="lock" className="footerIcon" />
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

export function TutorialPage() {
  return (
    <section className="tutorial">
      <div className="pageTitle">
        <div>
          <p className="eyebrow">מרכז ידע</p>
          <h1>מדריך</h1>
          <p>כך מוסיפים תבניות ושדות ומפיקים מסמכים.</p>
        </div>
      </div>
      <article className="card">
        <h2>הוספת תבנית</h2>
        <ol>
          <li>ערכו את קובץ ה־DOCX.</li>
          <li>
            שמרו אותו בתיקיית <code dir="ltr">templates</code>.
          </li>
          <li>העלו את השינוי ל־Git במאגר הפרטי.</li>
          <li>הפעילו פריסה מחדש.</li>
          <li>לחצו „רענון תבניות” במידת הצורך.</li>
        </ol>
      </article>
      <article className="card">
        <h2>יצירת שדה</h2>
        <p>
          כתבו בתוך המסמך <code>Xיום החתימהX</code>. שדה רגיל הוא שדה חובה.
        </p>
        <h3>שדה אופציונלי</h3>
        <code>Xתיאור חוב – לא חובה (להוסיף את המילה למעט)X</code>
        <p>הערך „משכנתא לבנק” יופק כ־„למעט משכנתא לבנק”. ערך ריק יוסר לחלוטין.</p>
      </article>
      <article className="card">
        <h2>קונים ומוכרים מרובים</h2>
        <p>הקיפו את אזור הקונה היחיד בסימונים הבאים, בפסקאות נפרדות:</p>
        <pre dir="rtl">
          X#קוניםX{`\n`}Xשם פרטי קונהX ...{`\n`}X/קוניםX
        </pre>
        <p>
          למוכרים השתמשו ב־<code>X#מוכריםX</code> וב־<code>X/מוכריםX</code>. התוכן שביניהם ישוכפל
          תוך שמירת העיצוב.
        </p>
      </article>
      <article className="card">
        <h2>שדה חדש</h2>
        <p>
          שדה לא מוכר יופיע במסך התבניות וידרוש סיווג: לקוח, נכס או עסקה. המערכת אינה מנחשת את
          השיוך.
        </p>
      </article>
      <article className="card">
        <h2>יצירת מסמכים</h2>
        <ol>
          <li>בחרו מסמכים או חבילת מסמכים.</li>
          <li>בחרו או הוסיפו קונים ומוכרים.</li>
          <li>בחרו נכס.</li>
          <li>השלימו את פרטי העסקה ואת השדות החסרים.</li>
          <li>לחצו „הפקת מסמכים” והורידו את הקובץ.</li>
        </ol>
      </article>
    </section>
  );
}

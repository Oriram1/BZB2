import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Mail } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { feeText, useTaskFees } from "@/lib/taskFees";

/**
 * TODO(itay): confirm the real support address. No support mailbox is defined
 * anywhere in the project, so until then this uses the only address that is
 * already published to users (the privacy policy). Replace with the real one
 * and drop the privacy-only line below if it becomes the same mailbox.
 */
const SUPPORT_EMAIL = "privacy@bzb.co.il";

/**
 * Help and support. There is no frame for this screen in the redesign file yet,
 * so it follows the existing look of the other text pages (terms, privacy).
 */
const Help = () => {
  const fees = useTaskFees();
  const navigate = useNavigate();
  const goBack = () => {
    if (window.history.length > 2) { navigate(-1); } else { navigate("/"); }
  };

  const faq: { question: string; answer: React.ReactNode }[] = [
    {
      question: "איך מוצאים מטלה?",
      answer: "במסך המטלות אפשר לסנן לפי קטגוריה, לחפש לפי שם או כתובת, למיין, ולעבור בין רשימה למפה. לחיצה על כרטיס פותחת את כל פרטי המטלה.",
    },
    {
      question: "איך מגישים מועמדות למטלה?",
      answer: "נכנסים לפרטי המטלה ושולחים מועמדות משם. מפרסם המטלה רואה את המועמדים ובוחר. את המצב של כל מועמדות אפשר לראות ב״המטלות שלי״.",
    },
    {
      question: "איך שומרים מטלה לאחר כך?",
      answer: "לוחצים על הלב בכרטיס המטלה. המטלות השמורות נמצאות תחת ״מועדפים״ בתפריט.",
    },
    {
      question: "למה לא רואים מרחק למטלות?",
      answer: "המרחק מחושב לפי המיקום של המכשיר. אם הגישה למיקום חסומה, צריך לאפשר אותה בהגדרות הדפדפן או המכשיר.",
    },
    {
      question: "כמה עולה לפרסם מטלה?",
      answer: (
        <>
          המטלה הראשונה חינם, פעם אחת לכל משתמש. בחשבון חינמי כל מטלה נוספת כרוכה בעמלה של {feeText(fees?.task_fee)}. מנוי בתשלום פועל ללא עמלת פרסום. הפירוט המלא נמצא ב<Link to={ROUTES.pricing} className="text-primary-ink font-bold hover:underline">עמוד המנויים</Link>.
        </>
      ),
    },
    {
      question: "פרסמתי מטלה והיא לא מופיעה. למה?",
      answer: "כל מטלה נשלחת לאישור לפני הפרסום. החיוב מתבצע רק אחרי האישור, והמטלה עולה רק אחרי שהחיוב עבר. מטלה שלא אושרה אינה מחויבת.",
    },
    {
      question: "אני הורה. צריך להירשם?",
      answer: "לא. הילד/ה מוסיף/ה את כתובת המייל שלכם מהפרופיל, ותקבלו עדכונים למייל.",
    },
  ];

  return (
    <div className="min-h-screen bg-muted py-12 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto bg-card rounded-3xl shadow-glow p-8 md:p-12 border border-border">
        <button type="button" onClick={goBack} className="inline-flex min-h-11 items-center gap-2 rounded px-2 text-primary-ink font-bold mb-6 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <ArrowRight aria-hidden="true" className="w-4 h-4" />
          חזרה
        </button>

        <h1 className="text-3xl font-extrabold text-foreground mb-2">עזרה ותמיכה</h1>
        <p className="text-muted-foreground mb-8">תשובות לשאלות נפוצות, ודרך לפנות אלינו.</p>

        <h2 className="text-xl font-bold text-foreground mb-4">שאלות נפוצות</h2>
        <div className="space-y-3">
          {faq.map((item) => (
            <details key={item.question} className="group rounded-2xl border border-border bg-background px-4">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl [&::-webkit-details-marker]:hidden">
                {item.question}
                <span aria-hidden="true" className="text-primary-ink transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="pb-4 leading-relaxed text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>

        <h2 className="text-xl font-bold text-foreground mt-10 mb-4">פנייה לתמיכה</h2>
        <p className="leading-relaxed text-foreground">
          לא מצאתם תשובה? כתבו לנו ונחזור אליכם.
        </p>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full gradient-honey px-6 font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Mail aria-hidden="true" className="w-4 h-4" />
          <span dir="ltr">{SUPPORT_EMAIL}</span>
        </a>

        <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6 text-sm">
          <Link to={ROUTES.terms} className="font-bold text-primary-ink hover:underline">תקנון ותנאי שימוש</Link>
          <Link to={ROUTES.privacy} className="font-bold text-primary-ink hover:underline">מדיניות פרטיות</Link>
        </div>
      </div>
    </div>
  );
};

export default Help;

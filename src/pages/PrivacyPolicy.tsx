import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-muted py-12 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto bg-card rounded-3xl shadow-glow p-8 md:p-12 border border-border">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-primary font-bold mb-6 hover:underline">
          <ArrowRight className="w-4 h-4" />
          חזרה
        </button>

        <h1 className="text-3xl font-extrabold text-foreground mb-2">מדיניות פרטיות</h1>
        <p className="text-muted-foreground mb-8">עדכון אחרון: מרץ 2026</p>

        <div className="prose prose-sm max-w-none text-foreground space-y-6 leading-relaxed">
          <p>
            ברוכים הבאים לאפליקציית BZB (להלן: "החברה", "האפליקציה" או "הפלטפורמה"). מדיניות פרטיות זו מנוסחת בהתאם להוראות חוק הגנת הפרטיות, התשמ"א-1981, ותקנותיו, וכן בהשראת תקנות ה-GDPR וה-CCPA, כדי להבטיח שקיפות מלאה לגבי אופן איסוף ועיבוד המידע שלך.
          </p>

          <h2 className="text-xl font-bold text-foreground mt-8">1. המידע שאנו אוספים</h2>
          <p>אנו אוספים סוגי מידע שונים בעת השימוש בפלטפורמה:</p>
          <ul className="list-disc pr-6 space-y-2">
            <li><strong>מידע שסופק על ידך:</strong> שם מלא, תאריך לידה (לצורך אימות גיל), כתובת דוא"ל, מספר טלפון, ופרטי התקשרות של הורה/אפוטרופוס (עבור קטינים).</li>
            <li><strong>מידע פיננסי:</strong> פרטי אמצעי תשלום (אלו מעובדים ונשמרים ישירות על ידי חברות סליקה חיצוניות העומדות בתקן המחמיר PCI-DSS, ולא על שרתי החברה).</li>
            <li><strong>נתוני מיקום (Geolocation):</strong> האפליקציה מבוססת מיקום ודורשת גישה לשירותי המיקום של מכשירך (GPS) כדי להציג מטלות רלוונטיות בסביבתך הקרובה. בעצם אישור הבקשה במערכת ההפעלה של מכשירך, הנך נותן את הסכמתך לאיסוף נתוני המיקום.</li>
            <li><strong>מידע טכנולוגי ושימוש:</strong> כתובת IP, סוג מכשיר, נתוני גלישה וקובצי עוגיות (Cookies).</li>
          </ul>

          <h2 className="text-xl font-bold text-foreground mt-8">2. שימוש במידע ושיתוף עם צדדים שלישיים</h2>
          <p>החברה אינה סוחרת במידע האישי שלך. עם זאת, לשם אספקת השירות, אנו עשויים לשתף מידע עם צדדים שלישיים:</p>
          <ul className="list-disc pr-6 space-y-2">
            <li><strong>שותפים עסקיים וספקי שירות:</strong> ספקי ענן, מערכות סליקה, ומערכות דיוור.</li>
            <li><strong>רשתות חברתיות ומערכות פרסום:</strong> אנו עשויים לשתף מזהים אנונימיים טכנולוגיים (כגון Advertising ID או פיקסלים) עם פלטפורמות דוגמת גוגל (Google), פייסבוק ואינסטגרם (Meta Platforms) לצורך ניתוח סטטיסטי, שיפור חווית המשתמש והתאמת קמפיינים שיווקיים מטורגטים.</li>
            <li><strong>אכיפת חוק:</strong> נשתף מידע באם נידרש לכך על פי צו שיפוטי או דרישת רשות מוסמכת.</li>
          </ul>

          <h2 className="text-xl font-bold text-foreground mt-8">3. דיוור ישיר ותוכן שיווקי</h2>
          <p>
            בעת ההרשמה לאפליקציה ובכפוף להסכמתך, הנך מאשר לחברה לשלוח אליך דברי פרסומת, עדכונים, הצעות ומידע שיווקי באמצעות דואר אלקטרוני, מסרונים (SMS), והודעות פוש (Push Notifications), בהתאם לסעיף 30א לחוק התקשורת (בזק ושידורים), התשמ"ב-1982. תוכל להסיר את עצמך מרשימת התפוצה בכל עת דרך הגדרות האפליקציה או באמצעות קישור ההסרה בגוף ההודעה.
          </p>

          <h2 className="text-xl font-bold text-foreground mt-8">4. פרטיות קטינים ובקרת הורים</h2>
          <p>
            הגנה על קטינים היא בראש סדר העדיפויות שלנו. רישום של משתמש מתחת לגיל 18 מחייב הסכמה דיגיטלית מתועדת של הורה או אפוטרופוס חוקי. אנו מספקים להורים מנגנוני בקרה ופיקוח על פעילות הקטין בחשבון, וההורה לוקח על עצמו אחריות מלאה בגין שיתוף המידע והשימוש באפליקציה על ידי הקטין.
          </p>

          <h2 className="text-xl font-bold text-foreground mt-8">5. זכויות המשתמש ואבטחת מידע</h2>
          <p>
            החברה נוקטת באמצעי אבטחה טכנולוגיים וארגוניים מחמירים למניעת גישה בלתי מורשית למידע. זכותך לפנות אלינו בכל עת בבקשה לעיין במידע השמור עליך, לתקנו, או לבקש את מחיקתו (בכפוף לחובות שמירת מידע על פי דין), באמצעות פנייה לשירות הלקוחות שלנו.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;

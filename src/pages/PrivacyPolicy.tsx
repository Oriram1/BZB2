import { Link } from "react-router-dom";
import PageHeader from "@/components/PageHeader";

const PrivacyPolicy = () => {
    return (
    <div className="figma min-h-screen bg-background relative isolate" dir="rtl">
      <div
        className="fixed inset-x-0 bottom-0 top-[64px] pointer-events-none -z-10"
        style={{ background: "linear-gradient(180deg, #FCE9E2 0%, #F4F4F5 37%, #F4F4F5 79%, #FCE9E2 100%)" }}
        aria-hidden="true"
      />
      <PageHeader variant="figma" centerTitle titleIsPageHeading title="מדיניות פרטיות" />
      <div className="max-w-3xl mx-auto px-4 py-5">
      <div className="rounded-[14px] bg-card shadow-card px-[14px] py-6 md:p-10">
        <p className="text-[15px] text-[#8B8C93] mb-6">עדכון אחרון: אוגוסט 2026</p>

        <div className="prose prose-sm max-w-none text-foreground space-y-6 leading-relaxed">
          <p>
            ברוכים הבאים לאפליקציית BZB (להלן: "החברה", "האפליקציה" או "הפלטפורמה"). מדיניות פרטיות זו מנוסחת בהתאם להוראות חוק הגנת הפרטיות, התשמ"א-1981, ותקנותיו, וכן בהשראת תקנות ה-GDPR וה-CCPA, כדי להבטיח שקיפות מלאה לגבי אופן איסוף ועיבוד המידע שלך.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-8">1. המידע שאנו אוספים ומטרות האיסוף</h2>
          <p>אנו אוספים סוגי מידע שונים בעת השימוש בפלטפורמה. להלן פירוט המידע הנאסף, המטרה שלשמה הוא נאסף, והבסיס החוקי לאיסופו:</p>
          <ul className="list-disc pr-6 space-y-2">
            <li><strong className="font-semibold">שם מלא:</strong> לצורך זיהוי המשתמש בפלטפורמה והצגתו למשתמשים אחרים. <em>בסיס חוקי: ביצוע חוזה (תנאי השימוש).</em></li>
            <li><strong className="font-semibold">גיל:</strong> לצורך אימות עמידה בגיל המינימלי להרשמה (13 למבצעי מטלות, 18 למציעי מטלות) והצגתו בפרופיל הציבורי. <em>בסיס חוקי: חובה חוקית (הגנת קטינים) וביצוע חוזה.</em></li>
            <li><strong className="font-semibold">מין:</strong> לצורך התאמת הממשק ללשון הפנייה בעברית (זכר/נקבה/ריבוי). <em>בסיס חוקי: אינטרס לגיטימי (חוויית משתמש).</em></li>
            <li><strong className="font-semibold">כתובת דוא"ל:</strong> לצורך הרשמה, אימות חשבון, ושליחת עדכונים הכרחיים לפעילות החשבון. <em>בסיס חוקי: ביצוע חוזה.</em></li>
            <li><strong className="font-semibold">מספר טלפון:</strong> לצורך תיאום מטלות בין מציעים למבצעים, ושליחת התראות דחופות. <em>בסיס חוקי: ביצוע חוזה.</em></li>
            <li><strong className="font-semibold">כתובת מגורים:</strong> לצורך התאמת מטלות רלוונטיות בסביבתך הגיאוגרפית. <em>בסיס חוקי: ביצוע חוזה.</em></li>
            <li><strong className="font-semibold">פרטי הורה/אפוטרופוס (עבור קטינים):</strong> לצורך קבלת הסכמה ומתן אפשרות פיקוח על פעילות הקטין. <em>בסיס חוקי: חובה חוקית (הגנת קטינים).</em></li>
            <li><strong className="font-semibold">מידע פיננסי:</strong> פרטי אמצעי תשלום, לצורך גביית תשלום עבור מנויים בתשלום. אלו מעובדים ונשמרים ישירות על ידי חברות סליקה חיצוניות העומדות בתקן המחמיר PCI-DSS, ולא על שרתי החברה. <em>בסיס חוקי: ביצוע חוזה.</em></li>
            <li><strong className="font-semibold">נתוני מיקום (Geolocation):</strong> לצורך הצגת מטלות רלוונטיות בסביבתך הקרובה. האפליקציה דורשת גישה לשירותי המיקום של מכשירך (GPS); בעצם אישור הבקשה במערכת ההפעלה של מכשירך, הנך נותן את הסכמתך לאיסוף נתוני המיקום. <em>בסיס חוקי: הסכמה מפורשת.</em></li>
            <li><strong className="font-semibold">מידע טכנולוגי ושימוש:</strong> כתובת IP, סוג מכשיר, נתוני גלישה וקובצי עוגיות (Cookies), לצורך אבטחת המערכת, שיפור ביצועים ומניעת הונאות. <em>בסיס חוקי: אינטרס לגיטימי (אבטחת מידע).</em></li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground mt-8">2. שימוש במידע ושיתוף עם צדדים שלישיים</h2>
          <p>החברה אינה סוחרת במידע האישי שלך. עם זאת, לשם אספקת השירות, אנו עשויים לשתף מידע עם צדדים שלישיים:</p>
          <ul className="list-disc pr-6 space-y-2">
            <li><strong className="font-semibold">שותפים עסקיים וספקי שירות:</strong> ספקי ענן, מערכות סליקה, ומערכות דיוור.</li>
            <li><strong className="font-semibold">רשתות חברתיות ומערכות פרסום:</strong> אנו עשויים לשתף מזהים אנונימיים טכנולוגיים (כגון Advertising ID או פיקסלים) עם פלטפורמות דוגמת גוגל (Google), פייסבוק ואינסטגרם (Meta Platforms) לצורך ניתוח סטטיסטי, שיפור חווית המשתמש והתאמת קמפיינים שיווקיים מטורגטים.</li>
            <li><strong className="font-semibold">אכיפת חוק:</strong> נשתף מידע באם נידרש לכך על פי צו שיפוטי או דרישת רשות מוסמכת.</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground mt-8">3. דיוור ישיר ותוכן שיווקי</h2>
          <p>
            בעת ההרשמה לאפליקציה ובכפוף להסכמתך, הנך מאשר לחברה לשלוח אליך דברי פרסומת, עדכונים, הצעות ומידע שיווקי באמצעות דואר אלקטרוני, מסרונים (SMS), והודעות פוש (Push Notifications), בהתאם לסעיף 30א לחוק התקשורת (בזק ושידורים), התשמ"ב-1982. תוכל להסיר את עצמך מרשימת התפוצה בכל עת דרך הגדרות האפליקציה או באמצעות קישור ההסרה בגוף ההודעה.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-8">4. פרטיות קטינים ובקרת הורים</h2>
          <p>
            הגנה על קטינים היא בראש סדר העדיפויות שלנו. רישום של משתמש מתחת לגיל 18 מחייב הסכמה דיגיטלית מתועדת של הורה או אפוטרופוס חוקי. אנו מספקים להורים מנגנוני בקרה ופיקוח על פעילות הקטין בחשבון, וההורה לוקח על עצמו אחריות מלאה בגין שיתוף המידע והשימוש באפליקציה על ידי הקטין.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-8">5. זכויות המשתמש ואבטחת מידע</h2>
          <p>
            החברה נוקטת באמצעי אבטחה טכנולוגיים וארגוניים מחמירים למניעת גישה בלתי מורשית למידע. זכותך לפנות אלינו בכל עת בבקשה לעיין במידע השמור עליך, לתקנו, או לבקש את מחיקתו (בכפוף לחובות שמירת מידע על פי דין), באמצעות פנייה לשירות הלקוחות שלנו.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-8">6. שמירת מידע וארכיון</h2>
          <p>
            כאשר משתמש מוחק תוכן באפליקציה (מטלות, מועמדויות וכד׳), המידע אינו נמחק באופן מיידי מהמערכת אלא מועבר לארכיון פנימי. מידע זה אינו מוצג באפליקציה ואינו נגיש למשתמשים, אך נשמר בשרתי החברה לצורך עמידה בדרישות חוקיות, פתרון סכסוכים ואכיפת תנאי השימוש. מידע בארכיון נשמר לתקופה מרבית של <strong className="font-semibold">7 שנים</strong> ממועד מחיקתו על ידי המשתמש, ולאחר מכן נמחק באופן אוטומטי ובלתי הפיך מהמערכת. תוכל/י לבקש מחיקה מוחלטת של המידע שלך מהארכיון בכל עת לפני תום תקופה זו, באמצעות פנייה לשירות הלקוחות.
          </p>
          <h2 className="text-lg font-semibold text-foreground mt-8">7. יצירת קשר בנושאי פרטיות</h2>
          <p>
            לכל פנייה בנושא מימוש זכויותיך — עיון, תיקון, מחיקה, או ניוד מידע — ניתן לפנות אלינו באמצעות:
          </p>
          <ul className="list-disc pr-6 space-y-2">
            <li>דוא"ל: <strong dir="ltr">privacy@bzb.co.il</strong></li>
          </ul>
          <p>
            אנו מתחייבים לטפל בפנייתך ולהשיב תוך <strong className="font-semibold">30 יום</strong> ממועד קבלתה, כנדרש בחוק.
          </p>
        </div>
      </div>
    </div>
    </div>
  );
};

export default PrivacyPolicy;

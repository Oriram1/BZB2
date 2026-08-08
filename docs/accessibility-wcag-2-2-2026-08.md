# נגישות — התאמה ל־WCAG 2.2 רמה AA

**תאריך:** 8 באוגוסט 2026
**ענף:** `a11y/wcag-2-2-aa-remediation`
**היקף:** דף הנחיתה נבדק חי מול `https://www.bzb-web.com/`; משם התיקונים הורחבו לכל האפליקציה, כי אותן שלוש תקלות חזרו כמעט בכל מסך.

---

## למה זה היה חשוב

לפני העבודה הזו היו באפליקציה **שתי פעולות שאי אפשר היה לבצע במקלדת בלבד**. הקריטית: צירוף תמונה למטלה במסך "פרסום מטלה". זו לא הייתה אי־נוחות — זו הייתה פונקציה חסומה לחלוטין למי שלא משתמש בעכבר.

בנוסף, כל כפתור באפליקציה הופיע פעמיים בניווט המקלדת ובקורא המסך, ו־7 מסכים לא היו להם כותרת ראשית בכלל.

---

## מה תוקן

### 1. הפעלה במקלדת — 2.1.1 (רמה A)

| מקום | מה היה | מה יש |
|---|---|---|
| [Landing.tsx](../src/pages/Landing.tsx) — חצי הגלילה | `<div onClick>` | `<button type="button">` עם `aria-label`, טבעת פוקוס ו־`aria-hidden` על שלושת ה־SVG |
| [CreateTask.tsx](../src/pages/CreateTask.tsx) — אזור העלאת תמונה | `<div onClick>` + `<input type="file" className="hidden">` | `<label htmlFor>` שעוטף `<input className="sr-only">` — סמנטיקה נייטיבית, בלי ARIA ובלי JS |

הבחירה ב־`sr-only` במקום `hidden` היא הליבה: `hidden` מוציא את השדה מסדר הטאב, `sr-only` משאיר אותו נגיש ורק מסתיר אותו ויזואלית.

### 2. פקדים מקוננים — 4.1.2 (רמה A)

כל קריאה לפעולה באפליקציה הייתה `<Link>` שעוטף `<Button>` — HTML לא חוקי שיוצר שתי עצירות טאב והכרזה כפולה בקורא מסך.

**21 מופעים ב־7 קבצים** הומרו ל־`<Button asChild><Link>`:
`Auth`, `Chat`, `MyTasks`, `ParentalHub`, `Profile`, `PublicProfile`, `ResetPassword`.

מדידה שהמחישה את הבעיה: ב־CTA התחתון של דף הנחיתה, ה־`<a>` היה בגובה 24px וה־`<button>` בגובה 60px — הם אפילו לא חפפו.

### 3. אזורי דף וכותרות — 1.3.1, 2.4.1, 2.4.6

- [App.tsx](../src/App.tsx) מרנדר `<main id="main">` יחיד + קישור "דילוג לתוכן הראשי" כפריט הממוקד הראשון במסמך.
- ארבעה דפים שהחזיקו `<main>` משלהם (`MyTasks`, `Register`, `AuthCallback`, `Admin`) הודחו ל־`<div>` כדי שלא ייווצר קינון.
- [PageHeader.tsx](../src/components/PageHeader.tsx) קיבל prop **`titleIsPageHeading`**. הוא **opt-in במכוון**: 6 דפים שמשתמשים ב־PageHeader כבר מחזיקים `<h1>` בגוף הדף, והפעלה גורפת הייתה יוצרת שתי כותרות ראשיות מתחרות.
  הודלק ב־`Chat`, `CreateTask`, `MyTasks`, `ParentReport`, `Settings`, `TaskDetail`.
- ל־`AuthCallback` נוסף `<h1 className="sr-only">` + `role="status"` על הודעת ההמתנה.

### 4. טפסים — 1.3.5, 3.3.1, 3.3.2, 3.3.3, 3.3.8

`Register.tsx` כבר היה מטופל היטב מראש. הפערים שנסגרו:

- **[Profile.tsx](../src/pages/Profile.tsx)** — 8 תוויות שלא היו מקושרות לשום שדה קיבלו `htmlFor` + `id` תואם, ועם זה `autocomplete` (`given-name`, `family-name`, `tel`, `street-address`). ה־radiogroup של המין קושר ב־`aria-labelledby`.
- **[Login.tsx](../src/pages/Login.tsx)** — שדה האימייל היה בלי `autoComplete="email"`, ולכן מנהל סיסמאות לא יכול היה למלא את הזוג. זה גם מה שסוגר את 3.3.8 (אין אימות שנשען על זיכרון בלבד).
- **[Login.tsx](../src/pages/Login.tsx) + [ResetPassword.tsx](../src/pages/ResetPassword.tsx)** — שגיאות חיו רק ב־toast שנעלם, והשדה נשאר נראה תקין. עכשיו השגיאה נשמרת ב־state, השדה מסומן `aria-invalid`, וההודעה מקושרת ב־`aria-describedby` עם `role="alert"`.
- **[Settings.tsx](../src/pages/Settings.tsx) + [CreateTask.tsx](../src/pages/CreateTask.tsx)** — Radix `SelectTrigger` הוא `<button>`, ש־`htmlFor` לא מגיע אליו; קושר ב־`aria-labelledby`.

### 5. באנר העוגיות — 2.4.11, 2.5.8, 4.1.2

[CookieConsent.tsx](../src/components/CookieConsent.tsx):

- `role="dialog"` → `role="region"` + `aria-labelledby`. הוא לא מודאלי ומעולם לא מקבל פוקוס, אז תפקיד `dialog` הבטיח מלכודת שלא קיימת.
- `scrollPaddingBottom: 16rem` על `<html>` כל עוד הבאנר פתוח — הבאנר תפס 224px מתוך 720 ברוחב 320px, והסתיר כל אלמנט ממוקד בתחתית הדף.
- כפתור ה־X היה **16×16px**. עכשיו `h-11 w-11 -m-2` — אזור מגע 44×44 בלי שינוי במראה.

### 6. חיווי פוקוס וגדלי יעד — 2.4.7, 2.5.8

- קישורי הפוטר, "מדיניות פרטיות" בבאנר וכפתור ה־X לא הציגו שום חיווי בניווט מקלדת. כולם קיבלו `focus-visible:ring` (בפוטר עם `ring-offset-foreground` כדי שייראה על הרקע הכהה).
- הוגדלו ל־`min-h-11`: "עריכה" ב־CreateTask (היה ~16px), "שכחתם סיסמה?" ב־Login (~20px), כפתורי "חזרה" ב־Terms ו־PrivacyPolicy.
- [AvatarPicker.tsx](../src/components/profile/AvatarPicker.tsx) — `<button>` בלי `type` ובלי שם נגיש, שנשען על `alt="Profile"`. עכשיו `type="button"` + `aria-label="שינוי תמונת הפרופיל"`, והתמונה `alt=""`.

### 7. הודעות מצב — 4.1.3

- [TaskList.tsx](../src/pages/TaskList.tsx) — סינון לפי קטגוריה או מרחק החליף את הרשימה בשקט מוחלט. נוסף live region: "נמצאו N מטלות".
- [Chat.tsx](../src/pages/Chat.tsx) — ה־lightbox היה `DialogContent` בלי `DialogTitle`, דרישה של Radix. קיבל כותרת `sr-only`.

**Sonner כבר מטפל נכון ב־live regions**, אז ה־toasts עמדו ב־4.1.3 מלכתחילה.

### 8. תוכן לא־טקסטואלי ותנועה — 1.1.1, 1.4.3, 2.3.3

- לוגו דף הנחיתה: `alt="BZB Logo"` → `alt=""` + `aria-hidden`. השם נאמר ב־`<h1>` שמיד אחריו; קודם הוא הוקרא פעמיים.
- המפריד `|` בפוטר עמד על **3.7:1** (נדרש 4.5:1) — הוכהה ל־`/60` וסומן `aria-hidden`.
- `scrollIntoView` הוא JavaScript ולא הושפע מה־reset הגלובלי ב־`index.css`; עכשיו הוא בודק `prefers-reduced-motion` בעצמו.

---

## קריטריונים שנבדקו ולא נמצאה בהם בעיה

| קריטריון | ממצא |
|---|---|
| **2.5.7** גרירה | אין drag-and-drop באפליקציה — לא רלוונטי |
| **1.4.13** תוכן בריחוף | אין טולטיפים בקוד המוצר, רק ה־`TooltipProvider` |
| **1.4.10** Reflow | ב־320px `scrollWidth === clientWidth`; אין טבלאות |
| **3.2.6** עזרה עקבית | אין רכיב עזרה באפליקציה |
| `prefers-reduced-motion` | reset גלובלי קיים ב־[index.css:190](../src/index.css) |
| IDs כפולים | אין |
| מלכודות מקלדת | אין — מגירת הניווט משתמשת נכון ב־`inert` |
| `lang` / `dir` | `lang="he" dir="rtl"` תקין |

---

## מנגנוני הגנה מפני נסיגה

זה החלק שמחזיק לטווח ארוך.

### ESLint — בזמן כתיבה

`eslint-plugin-jsx-a11y` הותקן והופעל ב־[eslint.config.js](../eslint.config.js), עם שלושה כללים שהועלו במפורש ל־`error`:
`no-static-element-interactions`, `click-events-have-key-events`, `no-noninteractive-element-interactions` — בדיוק אלה שתפסו את הבאגים האמיתיים כאן.

`label-has-associated-control` הוגדר עם `controlComponents` כדי שיזהה את עטיפות shadcn (`Checkbox`, `Input`, `PasswordInput`, `Textarea`, `Switch`, `RadioGroupItem`).

**הפלאגין מצא מיד עוד 9 בעיות שהבדיקה הידנית פספסה.** כל אחת טופלה או הושתקה עם נימוק כתוב בקוד:

- `MobileNav` — ה־scrim של המגירה הוא דקורטיבי; Escape סוגר, והוא סומן `aria-hidden`.
- `VoiceNoteBubble` — להקלטות קוליות של משתמשים אין קובץ כתוביות לצרף.
- `ui/card.tsx` — `CardTitle` הוא עטיפה גנרית שהתוכן שלה מגיע ב־props.

```bash
npx eslint src e2e
```

### Playwright + axe-core — על האתר הרץ

[e2e/accessibility.spec.ts](../e2e/accessibility.spec.ts) — סריקת axe בתגיות
`wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa` על 7 מסלולים ציבוריים, ובנוסף בדיקות ידניות:

- `h1` יחיד ו־`main` יחיד בכל מסלול
- קישור הדילוג הוא הפריט הראשון בטאב, נראה, ועובד ב־Enter
- אין פקד קטן מ־24×24 (עם החרגות שכתובות בקוד: קישור בתוך משפט, ופקד שמוסתר עד קבלת פוקוס)
- אין פקדים אינטראקטיביים מקוננים

**התוצאה: 22/22 עוברים בדסקטופ ובמובייל.**

```bash
npx vite build
npx vite preview --port 4173 &
E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/accessibility.spec.ts
```

### `E2E_BASE_URL` ב־playwright.config

בלי המשתנה הזה הסוויטה מתחברת לכל מה שכבר מאזין על פורט 8080. במהלך העבודה זה גרם לתוצאות שווא — הבדיקות רצו מול אפליקציה אחרת לגמרי. עכשיו אפשר לכוון אותה לבנייה נקייה או לדיפלוי.

---

## מה נשאר לעשות

### עדיפות גבוהה

1. **החלפת הסיסמה של `itayk93@gmail.com`.**
   הסיסמה הוסרה מ־[e2e/auth-screenshot.spec.ts](../e2e/auth-screenshot.spec.ts) ועברה ל־`E2E_EMAIL` / `E2E_PASSWORD`, **אבל היא עדיין קיימת בהיסטוריית ה־git**. מחיקה מהקובץ לא מוחקת קומיטים קודמים. הסיסמה חשופה עד להחלפה בפועל.

2. **כיסוי axe למסכים מאחורי התחברות.**
   הסריקה מכסה רק מה שאורח רואה. `Profile`, `Chat`, `MyTasks`, `CreateTask`, `Settings`, `ParentalHub` ו־`Admin` לא נסרקו אוטומטית. חסר session fixture ל־Playwright.

3. **בדיקה ידנית עם קורא מסך.**
   שום כלי אוטומטי לא מחליף מעבר VoiceOver על התיקונים. נקודות למיקוד: סדר הפוקוס בפתיחה וסגירה של דיאלוגים, וההכרזה של live region ברשימת המטלות.

### עדיפות בינונית

4. **`--muted-foreground` — שיפור AAA זול.**
   כרגע `25 15% 40%` (≈5.9:1 — עומד ב־AA). הכהיה ל־`33%` מביאה את כל טקסט המשנה ל־AAA. **לא בוצע במכוון** — זה טוקן גלובלי שמשנה את המראה של כל מסך באפליקציה, וזו החלטה עיצובית.

5. **`test-results/` ב־`.gitignore`.**
   התיקייה tracked ב־repo, ולכן כל הרצת בדיקות מלכלכת את ה־diff ב־19 קבצי artifacts.

6. **`e2e/auth-screenshot.spec.ts` — הפעלה מחדש.**
   הבדיקה נכשלה עוד לפני העבודה הזו (באנר העוגיות חסם את כפתור ה־submit). התיקון נכלל, אבל הבדיקה מדלגת על עצמה עד שיוגדרו `E2E_EMAIL` ו־`E2E_PASSWORD`.

### לתשומת לב

7. **`server/`** — תיקייה untracked שלמה (Dockerfile, drizzle, src, test) שלא נגעתי בה ולא הוכנסה לקומיט. לא ברור אם היא אמורה להיכנס ל־git.

---

## אימות שבוצע

| בדיקה | תוצאה |
|---|---|
| `tsc --noEmit` | ✅ נקי |
| `eslint src e2e` | ✅ נקי (0 בעיות) |
| `vite build` | ✅ 3.33s |
| `e2e/accessibility.spec.ts` | ✅ 22/22 (דסקטופ + מובייל) |
| שאר סוויטת ה־e2e | 49 עברו |

# מסמך תיעוד עסקי ומוצרי - BusyBee Chore Connect

**תאריך ושעת תיעוד:** 27 ביולי 2026 (2026-07-27 07:39:06)  
**פרויקט:** BusyBee Chore Connect  
**סביבה:** Production Ready / Hebrew RTL / Mobile-First  
**מחברים:** צוות פיתוח ומוצר (AI Pair Programming)

---

## Executive Summary (תמצית מנהלים)

במהלך סשן הפיתוח הנוכחי בוצעה שורת שדרוגים מוצריים, טכנולוגיים וארגונומיים בפלטפורמת **BusyBee Chore Connect**.  
הדגש המרכזי הושם על:
1. **התאמה מלאה לשוק הישראלי (RTL Localization)** ומענה לחוקי ספר הנגישות והארגונומיה.
2. **שיפור יחסי ההמרה (Conversion Rate Optimization)** בטפסי המערכת באמצעות רכיבי DatePicker & TimePicker עבריים מותאמים.
3. **ארגונומיה מתקדמת במובייל (Mobile Ergonomics)** עם סרגל צף תחתון באזור האגודל וצ'יפים לסריקה מהירה.
4. **מנגנון מחיקת מטלות וניהול הרשאות** המאפשר ליוצר המטלה שליטה מלאה על המידע שלו.
5. **שפה טיפוגרפית ומותגית אחידה** עם שילוב פונקנט Heebo הגלובלי וכפתור הנעה לפעולה ניגודי ויוקרתי.

---

## 1. הערך העסקי והאימפקט המוצרי (Business Value & Product Impact)

### 1.1 העלאת יחסי המרה בטופס יצירת מטלה (CRO)
* **האתגר העסקי:** שדות קלט לא מותאמים (כמו שדות תאריך ושעה של הדפדפן שנפתחים באנגלית או הפוך) גורמים לתסכול משתמשים ולנטישה (Drop-off) בטפסי יצירת מודעות.
* **הפתרון המוצרי:** הטמעת **Custom DatePicker & TimePicker עברי מותאים אישית** המציג תאריך תקני בפורמט `DD/MM/YYYY` (למשל `22/09/1993`) ושעות נפתחות במרווחים קבועים של 30 דקות.
* **אימפקט עסקי:** חוויית יצירת מטלה קולחת, מהירה ונטולת חיכוך, המעלה את שיעור השלמת יצירת המטלות בפלטפורמה.

### 1.2 ארגונומיה במובייל ושימור משתמשים (Mobile Ergonomics & Retention)
* **האתגר העסקי:** מעל 75% מהמשתמשים בישראל ניגשים לשירות דרך מכשירים ניידים. כפתורים המוסתרים על ידי סרגלי ניווט מורידים את ה-Engagement.
* **הפתרון המוצרי:**
  - שדרוג מסך פרטי המטלה (`TaskDetail.tsx`) למבנה מבוסס **צ'יפים לסריקה מהירה (Stat Chips)**.
  - הטמעת **סרגל פעולות צף תחתון (Floating Action Bar)** הממוקם בדיוק באזור האגודל (Thumb Zone).
  - שילוב סרגל עליון אחיד (`PageHeader`) המונע חפיפת כפתורי ניווט ותפריט מגירה.
* **אימפקט עסקי:** שיפור מדדי ה-Retention, הגדלת מעורבות המשתמשים וקצב הגשת המועמדויות למטלות.

### 1.3 ניהול מטלות, אמינות הנתונים ואיכות ה-Feed
* **האתגר העסקי:** היעדר אפשרות למחוק מטלות יוצר עומס של "מטלות יתומות" (Stale Tasks) במערכת ופוגע באמינות הלוח.
* **הפתרון המוצרי:** הטמעת מנגנון **מחיקת מטלה מאובטח (Task Deletion)** המורשה אך ורק ליוצר המטלה (`isOwner`), עם חלון אישור כפול (AlertDialog) ב-RTL.
* **אימפקט עסקי:** שמירה על לוח מטלות עדכני, אמין ונקי, והגברת האמון של המשתמשים במערכת.

### 1.4 מיתוג וטיפוגרפיה (Branding & Typography)
* **הפתרון המוצרי:**
  - הטמעת פונט **Heebo** הגלובלי מבית Google Fonts בכל עמודי המערכת למראה עברי נקי וקריא.
  - עיצוב כפתור CTA ניגודי בצבע לבן-זכוכית עם אייקון פלוס כתום בולט (`Plus size={16} text-amber-600 stroke-[3]`) המבטיח קריאות מושלמת על גבי רקע הדבש.

---

## 2. פירוט תכונות המוצר ותהליכי המשתמש (Product Features & User Flows)

### 2.1 תהליך יצירת מטלה חדשה (`/create-task`)
1. **יישור שדות:** כל שדות הקלט והטקסט מוגדרים ברירת מחדל לימין (`text-right` ו-`dir="rtl"`).
2. **הזנת תשלום מוצע:** סימן השקל (`₪`) ממוקם בקצה השמאלי של התיבה, בעוד המספר מוקלד מימין.
3. **תאריך ושעה:**
   - לחצן התאריך מציג Placeholder עברי נקי: `בחירת תאריך (DD/MM/YYYY)`.
   - בלחיצה נפתח לוח שנה עברי צף (Popover Calendar) המאפשר בחירת תאריך קלה בפורמט `22/09/1993`.
   - השעה נבחרת מתוך תפריט נשלף במרווחים חצי-שעתיים (`07:00` עד `22:30`).

### 2.2 תהליך ניהול מטלות אישיות (`/my-tasks`)
1. **צפייה במטלות שפורסמו:** כל כרטיסיה מציגה את שם המטלה, תיאור קצר, סטטוס נוכחי, ומספר צפיות.
2. **מעבר ישיר לפרטים:** לחיצה על כותרת המטלה או על הכפתור **`למסך המטלה ←`** מעבירה ישירות לעמוד המטלה `/task/:id`.
3. **מחיקת מטלה:** לחיצה על אייקון הפח 🗑️ פותחת חלון אישור המוחק את המטלה מ-Supabase ומעדכן את הרשימה במקום.

### 2.3 תהליך צפייה וניהול פרטי מטלה (`/task/:id`)
1. **סרגל ניווט עליון (Top App Bar):** מבוסס `PageHeader` אחיד עם לחצן חזרה, כותרת המטלה וכפתור שיתוף.
2. **כרטיס המחיר (Payment Hero Card):** מציג את התשלום המוצע בעיצוב דבש מודגש.
3. **צ'יפים של נתוני מפתח (Stat Chips Grid):** תצוגה מודרנית של מיקום, תאריך, שעה, משך זמן מוערך ומספר עובדים.
4. **סרגל צף תחתון (Floating Action Bar):**
   - **עבור מבצע מטלה (Bee):** כפתור בולט להגשת מועמדות.
   - **עבור מזמין המטלה (Owner):** כפתור ניהול מטלה + כפתור מחיקת מטלה אדום.

---

## 3. מפרט טכני וארכיטקטורת קוד (Technical Architecture)

### 3.1 CSS & WebKit Shadow DOM Engine Override
כדי להתגבר על מנגנון ה-Shadow DOM הפנימי של דפדפני WebKit/Blink (Chrome & Safari), הוגדרו כללים ייעודיים ב-[index.css](file:///Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/index.css):

```css
/* WebKit Shadow DOM RTL Fixes */
input[type="date"],
input[type="time"] {
  direction: rtl !important;
  text-align: right !important;
  display: flex !important;
  flex-direction: row-reverse !important;
  align-items: center !important;
  justify-content: space-between !important;
}
```

### 3.2 תיקון שגיאות וטיפול בבטיחות הנתונים (Bug Fixes & Security)
1. **תיקון שגיאת Supabase RPC (`TypeError: catch is not a function`):**
   - הוחלפה הקריאה הישנה בעדכון בטוח בתוך בלוק `try...catch` המבטיח שטעינת הדף לא תיתקע לעולם במצב Skeleton.
2. **פירמוט עברי טבעי למשך זמן (`formatDuration`):**
   - ערכים חלקיים המומרים משבר עשרוני הוצגו בדקות (`23 דקות`, `חצי שעה`, `שעה וחצי`).
3. **תיקון ייבוא אייקונים (`ReferenceError: Plus is not defined`):**
   - הוספת ייבוא `Plus` מ-`lucide-react` ב-[MyTasks.tsx](file:///Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/pages/MyTasks.tsx).

---

## 4. מפרט קבצים ששונו (File Changes Registry)

| קובץ | מסלול | סוג השינוי ופירוט |
| :--- | :--- | :--- |
| **index.html** | `index.html` | ייבוא Google Font - Heebo |
| **index.css** | `src/index.css` | כללי CSS גלובליים ל-RTL, WebKit Shadow DOM ופונט Heebo |
| **tailwind.config.ts** | `tailwind.config.ts` | הגדרת Heebo כפונט ה-sans הראשי במערכת |
| **format.ts** | `src/lib/format.ts` | פונקציית `formatDuration` מותאמת עברית לתוצאות מדויקות |
| **input.tsx** | `src/components/ui/input.tsx` | ברירות מחדל `dir="rtl"` ו-`text-right` |
| **textarea.tsx** | `src/components/ui/textarea.tsx` | ברירות מחדל `dir="rtl"` ו-`text-right` |
| **select.tsx** | `src/components/ui/select.tsx` | התאמת תפריטים נפתחים ל-RTL ויישור אייקונים |
| **popover.tsx** | `src/components/ui/popover.tsx` | ברירת מחדל `dir="rtl"` לרכיבי Popover צפים |
| **alert-dialog.tsx** | `src/components/ui/alert-dialog.tsx` | התאמת דיאלוגים למובייל ול-RTL |
| **CreateTask.tsx** | `src/pages/CreateTask.tsx` | DatePicker עברי בפורמט `DD/MM/YYYY`, תפריט שעות |
| **MyTasks.tsx** | `src/pages/MyTasks.tsx` | קישורי מעבר דינמיים, כפתור מחיקה וייבוא Plus |
| **TaskList.tsx** | `src/pages/TaskList.tsx` | כפתור פרסום מטלה ניגודי לבן עם אייקון פלוס כתום בולט |
| **TaskDetail.tsx** | `src/pages/TaskDetail.tsx` | שילוב PageHeader אחיד, עיצוב Mobile-First, סרגל צף תחתון ותיקון RPC |

---

## 🧪 אימות ובנייה (QA & Verification)
- הרצת `npm run build` הסתיימה בהצלחה מלאה (0 שגיאות קומפילציה).
- אושרה תמיכת RTL מלאה בכל מסכי האפליקציה.

# ביטול מטלה וארכיון במקום מחיקה

## מה נוסף

- החלקה ימינה בכרטיס מטלה שפורסמה פותחת חלון אישור RTL.
- כפתור **ביטול המטלה** משנה סטטוס ל־`cancelled`.
- כפתור **מחיקה (ארכיון)** מעביר מטלה ומועמדויות לארכיון פנימי ומסתיר אותן מהאתר.
- ביטול שולח למועמדים שהתקבלו התראת מערכת, Push ומייל — לפי הגדרות המשתמש.
- נוסף בהגדרות מתג: `מטלה שהתקבלתי אליה בוטלה`.

## זרימת התראה

1. `MyTasks` מעדכן מטלה ל־`cancelled`.
2. נוצר row ב־`notifications` לכל מועמד עם סטטוס `accepted`.
3. `notify-dispatch` מפיץ in-app, Push ומייל לפי העדפות וערוץ המשתמש.
4. שם המטלה ושם המבטל מוצגים בהודעה.

## ארכיון

Migration `20260802140000_archived_records_and_task_cancelled.sql` מוסיפה `archived_records`, `tasks.archived_at`, `task_applications.archived_at` ו־RPC בשם `archive_task`.

`archive_task` פועל אטומית, בודק בעלות, שומר snapshot JSONB של המטלה והמועמדויות, ומסמן אותן בארכיון. אין hard-delete בפעולת מחיקת מטלה. מחיקה פיזית עתידית תתבצע רק מתהליך אדמין ייעודי בארכיון.

## קבצים עיקריים

- `src/pages/MyTasks.tsx` — ביטול, ארכיון, swipe ו־dialog.
- `src/lib/notificationCopy.ts` — סוג אירוע, טקסטים והגדרות.
- `supabase/functions/_shared/notificationCopy.ts` — טקסטי Edge Function.
- `supabase/functions/notify-dispatch` — נפרס מחדש.
- `src/pages/TaskList.tsx`, `src/pages/TaskDetail.tsx` — הסתרת רשומות בארכיון.
- `src/pages/PrivacyPolicy.tsx` — מדיניות שמירת מידע בארכיון.

## אימות

- `npm run lint` — עבר, 13 warnings קיימים.
- `npm test -- --run` — עבר, 19/19.
- `npm run build` — עבר.
- E2E tasks — 2/3 עברו; בדיקת list/map הקיימת נכשלה בגלל selector ישן שאינו תואם ל־UI הנוכחי.
- Supabase migration — הוחלה בפרויקט המרוחק.
- `notify-dispatch` — נפרס לפרויקט המרוחק.

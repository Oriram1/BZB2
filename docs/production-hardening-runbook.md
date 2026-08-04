# BusyBee — Production Hardening Runbook

## לפני deploy

- [ ] יש backup חדש של DB וגם Storage.
- [ ] בוצע restore לסביבה נפרדת והאפליקציה עולה.
- [ ] migration נבדקה ב־staging.
- [ ] `npm run lint` עובר.
- [ ] `npm test` עובר.
- [ ] `npm run build` עובר.
- [ ] smoke test מוכן למשתמש רגיל, משתמש תפקיד אחר ו־admin.

## סדר deploy

1. Freeze לכתיבות breaking.
2. Apply migrations.
3. Deploy Edge Functions.
4. Deploy frontend.
5. המתן ל־PWA update.
6. הרץ smoke tests.
7. בדוק logs של auth, functions ו־DB.

Frontend חדש לא עולה לפני שה־DB וה־functions תומכים ב־API שלו.

## Smoke חובה

### משתמש רגיל

- לא יכול לקרוא role של משתמש אחר.
- לא יכול להוסיף admin.
- לא יכול לשנות `creator_id` או system column.
- לא יכול לבטל מטלה של משתמש אחר.
- יכול לראות רק פרופיל ציבורי מצומצם.

### משתמש tasker/bee/parent

- יכול לבצע רק workflow של התפקיד שלו.
- שינוי status אסור אם resource לא שלו.
- retry לא יוצר duplicate role, conversation או notification.

### Admin

- יכול לבצע פעולות admin מורשות בלבד.
- כל פעולה רגישה מופיעה ב־audit.
- MFA פעיל לפני Production רגיש.

## Rollback

- Frontend: חזרה ל־build הקודם.
- Edge Function: חזרה לגרסה קודמת תואמת.
- DB: לא עושים rollback עיוור. משתמשים ב־compatibility migration או restore מאומת.
- אם migration breaking: משאירים compatibility window לפני הסרת השדה/הפונקציה.

## חסר כרגע

- `send-password-reset` הוסרה מ־Production אחרי audit. אין frontend שקורא לה; `send-auth-email` הוא המסלול הקנוני.
- אין הוכחה מהריפו ש־backup/restore רצים בפועל.
- אין credentials לחשבון throwaway, לכן live privilege test מדולג.
- MFA ו־rate limits תלויים בהגדרות Supabase/Vercel ולא ניתנים לאימות מקומי בלבד.

## Evidence לפני מסירה

שומרים release record עם:

- commit/build id;
- migration version;
- backup id;
- restore test result;
- smoke result;
- rollback owner ו־timestamp.

## Deployment record — 2026-08-04

- `20260804130000_canonical_task_cancellation.sql`: applied.
- 13 repository Edge Functions: deployed.
- `send-password-reset`: removed as dead legacy function.
- linked DB lint: passed, no schema errors.

# BusyBee — תיקוני ארכיטקטורה

## מה נבדק

הושווה דוח אבטחה מפרויקט אחר מול הקוד, ה־migrations, `config.toml`, RLS ובדיקות BusyBee.

## ממצא שתוקן

`send-quiet-digest` עובד כ־cron ומאמת `x-notify-secret`. הוא לא היה רשום ב־`supabase/config.toml`, ולכן ברירת המחדל של Supabase הייתה `verify_jwt = true`.

תיקון:

- נוסף `[functions.send-quiet-digest]` עם `verify_jwt = false`.
- secret נשאר חובה בתוך הפונקציה.
- נוספה בדיקה שכל תיקיית Edge Function קיימת גם ב־config.
- `geocode-address` מגביל כתובת ל־500 תווים ומפסיק בקשת Google אחרי 8 שניות.
- בקשות ל־Resend נעצרות אחרי 10 שניות.
- ביטול מטלה עבר מכתיבות React נפרדות ל־`cancel_task` יחיד ב־DB: authorization, שינוי סטטוס והתראות באותה transaction.
- נוספו headers ב־Vercel: CSP עם allowlist ל־Google/Supabase/Maps, `nosniff`, Referrer Policy ו־Permissions Policy.
- Edge Functions לא מחזירות יותר exception/SQL/provider detail ללקוח; מחזירות `internal_error` ורושמות detail רק בלוג שרת.
- `admin-reset-password` מחזיר קודי שגיאה יציבים ולא את הודעת Supabase Auth.
- `send-auth-email` מחזיר `email_send_failed`; ספק email detail נשאר בלוג שרת.
- responses של user Edge Functions מסומנים `Cache-Control: no-store`.
- migration `20260804130000_canonical_task_cancellation.sql` הוחלה ב־Production.
- כל 13 Edge Functions שב־repo נפרסו מחדש ל־Production.

## מה כבר קיים ב־BusyBee

- פונקציות משתמש מוגנות ב־JWT.
- חריגי cron/webhook משתמשים ב־secret ייעודי.
- RLS הוא גבול ההרשאה; `RoleGuard` הוא UX בלבד.
- יש RPC מצומצם לפרופילים ציבוריים.
- יש הגנה על system columns.
- שינוי role עובר דרך invariant ו־RPC.
- אישור מועמדות יוצר conversation דרך trigger אטומי ב־DB; הקריאה מה־UI משמשת רק לניווט.
- מחיקה עסקית היא archive עם `archived_at`.
- קיימים `fetchAllPages` ו־architecture invariants נגד תקרות תצוגה.
- service role לא נשלח לקוד הדפדפן.

## כללים להמשך

1. כל Edge Function חדשה חייבת להופיע ב־`supabase/config.toml`.
2. `verify_jwt = false` מותר רק ל־cron/webhook עם אימות עצמאי.
3. אין יצירת service-role client לפני אימות caller והרשאה, בפונקציות משתמש.
4. פעולה עסקית רגישה מקבלת command קנוני אחד עם authorization, transaction, idempotency ו־audit.
5. אין הרשאה לפי `user_metadata`, `localStorage`, URL או ערך מהלקוח.
6. אין `limit` או `slice` שמסתירים אוסף שהמשתמש רשאי לראות.
7. שינוי schema נכנס ל־migration ונבדק מול frontend, RLS, RPC ו־Edge Functions.
8. ביטול מטלה משתמש רק ב־`cancel_task`; אין insert ישיר ל־`notifications` מהדפדפן.

## סיכון שיורי

עדיין נדרש לפני Production מלא:

- smoke test מול Supabase אמיתי למשתמש רגיל, תפקיד אחר ו־admin;
- dry-run/בדיקת restore למיגרציות וגיבוי;
- audit לכל workflow שיש בו יותר ממסלול כתיבה אחד;
- בדיקת rate limit ו־timeout לכל ספק חיצוני.
- בדיקת live privilege עדיין דורשת חשבון throwaway.
- Auth rate limits הוגדרו ב־Production: email 10, OTP 10, verify 10, SMS 5, anonymous 30, refresh 150.
- backup/restore test עבר על dump של Production ל־Postgres זמני מבודד; קבצי backup לא נכנסים ל־Git.
- Production הכיל function מתה בשם `send-password-reset`; לא היה frontend שקרא לה, והתיעוד ציין שהוחלפה ב־`send-auth-email`. היא נמחקה מ־Production אחרי audit.

אלה פעולות Production שלא ניתן להוכיח מהריפו בלבד.

Runbook מלא: [production-hardening-runbook.md](./production-hardening-runbook.md).

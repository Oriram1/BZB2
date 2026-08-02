# כללי עבודה מחייבים ל־BusyBee

הכללים האלה חלים על כל שינוי בקוד, בסכמה, ב־Supabase ובתשתית.

## לפני שינוי

1. מגדירים חוזה: קלט, פלט, שגיאות, הרשאות ו־invariants.
2. ממפים את המסלול הקיים לפני שמוסיפים מסלול חדש.
3. מאתרים את מקור האמת הקנוני. אין להעתיק לוגיקה קריטית בין React, SQL ו־Edge Function.
4. בודקים migrations, RLS, functions, triggers, storage ו־frontend יחד.

## אבטחה והרשאות

- `RoleGuard` הוא UX בלבד. האבטחה האמיתית נמצאת ב־RLS, ב־RPC וב־Edge Function.
- כל פעולה רגישה בודקת JWT, תפקיד, resource scope ו־MFA כשנדרש.
- `verify_jwt = true` הוא ברירת המחדל. `false` מותר רק ל־webhook או cron עם חתימה/secret עצמאי.
- אין להסתמך על `user_metadata`, ערך מהדפדפן או שדה שהלקוח יכול לשנות כמקור הרשאה.
- `service_role` נוצר ונעשה בו שימוש רק אחרי אימות והרשאה, ורק כש־RLS אינו מספיק.
- אין להחזיר ללקוח שדות רגישים; משתמשים ב־DTO או view מצומצם.
- כל token לשיתוף חייב להיות hashed, מוגבל בזמן, ניתן לביטול ובעל scope.

## מסד נתונים וכתיבות

- לכל workflow רגיש יש command קנוני אחד: RPC או Edge Function.
- כתיבה מורכבת מתבצעת בתוך transaction עם idempotency key.
- RLS מגדיר מי יכול לגשת לשורה; trigger/constraint מגן על שדות מערכתיים.
- triggers מיועדים ל־invariants מקומיים. workflow עסקי מפורש שייך ל־command.
- כל שינוי schema נכנס ל־migration ב־Git. אין שינוי ידני ב־Production.
- אין grants רחבים בלי הצדקה מתועדת.

## שאילתות ונתונים

- אין תקרת תצוגה עסקית נסתרת.
- `limit(1/2)` מותר רק לרשומה יחידה או בדיקת ambiguity.
- אוסף נטען באמצעות `fetchAllPages` או `range` עד לעמוד קצר. גודל עמוד הוא פרט טכני, לא cap.
- אין `slice`, `limit`, `page <= N` או `perPage` שמחליטים כמה מידע המשתמש יראה.
- שאילתות כבדות/אנליטיקה עוברות ל־view, aggregate או RPC שמחזיר רק מידע מורשה.
- לכל query יש filter הרשאה, order יציב וטיפול מפורש בשגיאה.

## צד לקוח

- React מציג state; הוא לא מקור האמת לציון, הרשאה, סטטוס או חישוב רשמי.
- Effects משמשים לסנכרון חיצוני בלבד, עם dependencies מלאים או הסבר מפורש.
- מסכים כבדים נטענים lazy; לא טוענים Admin, Maps או Charts במסלול הראשוני.
- מצבי loading, empty, error ו־success חייבים להיות מפורשים.

## תפעול ופריסה

- שינוי schema, function ו־frontend נבדק כגרסה אחת תואמת.
- לפני deploy: test, lint, build, migration dry-run ו־smoke test.
- גיבוי נחשב קיים רק אחרי restore test. שינוי breaking דורש rollback או compatibility window.
- שירות חיצוני חייב timeout, retry מוגבל, idempotency ו־fallback או תיעוד של היעדרם.

## שער איכות חובה

לפני מסירה יש להריץ `npm run lint`, `npm test` ו־`npm run build`, לבדוק את ה־diff ולתעד residual risk. שינוי הרשאות או migration דורש גם בדיקת משתמש רגיל, משתמש מורשה ו־admin.

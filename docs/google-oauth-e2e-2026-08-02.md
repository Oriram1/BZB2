# Google OAuth — בדיקת E2E

תאריך: 2026-08-02

## סטטוס

- הזרימה עודכנה ל־Google Identity Services ישיר, לפי `coupon_manager_project_new`.
- האפליקציה מקבלת Google ID token ומעבירה אותו ל־`supabase.auth.signInWithIdToken`.
- אין redirect OAuth דרך `nrqgoaxraywprlbyzrso.supabase.co` במסלול החדש.
- Google OAuth מחובר לפרויקט `BZB-hive`.
- שם האפליקציה ב־Google: `BZB`.
- כתובות production, Vercel ו־localhost מוגדרות.
- Client Secret לא מתועד בקובץ זה ולא נשמר בקוד.
- לא בוצע commit או push.

## מה נבדק

### מימוש חדש — Google Identity Services

- נוסף Google Identity Services script ל־`index.html`.
- נוסף `VITE_GOOGLE_CLIENT_ID` ל־env המקומי.
- Google login משתמש ב־popup וב־ID token.
- משתמש קיים מנותב ל־`/tasks`.
- משתמש חדש מנותב ל־onboarding ובחירת Role.

תוצאה: **build/lint/tests עברו**. בדיקת popup מול חשבון נוסף דורשת בחירת חשבון נוסף בחלון Google.

### משתמש קיים

1. פתיחת האתר המקומי ב־`http://localhost:8080/login`.
2. לחיצה על `המשך עם Google`.
3. בחירת חשבון Google שהיה מחובר בדפדפן.
4. חזרה מוצלחת אל `/tasks`.

תוצאה: **עבר**.

### משתמש Google חדש

הזרימה בקוד:

1. Google OAuth מחזיר משתמש ל־`/auth/callback`.
2. אם נשמר Role מהרשמה — המשתמש עובר ל־`/register/:role?google=1`.
3. אם אין Role קיים במסד — המשתמש עובר ל־`/auth?google=1`.
4. המשתמש בוחר סוג שימוש: מציע מטלות, מקבל מטלות או הורה.
5. מסך ההרשמה משלים פרופיל ו־Role.
6. רק לאחר מכן המשתמש נכנס ל־`/tasks`.

תוצאה: **מסלול ממומש בקוד, אך לא ניתן היה להשלים חשבון Gmail שני בפועל**, כי בדפדפן היה מחובר רק החשבון הקיים. אין להכניס סיסמה או קוד אימות של משתמש אחר ללא נוכחותו.

## בדיקות איכות

- `npm run lint` — עבר.
- `npm test` — עבר: 23 בדיקות.
- `npm run build` — עבר.

## הערת אבטחה

הוספת Role עדיין משתמשת במנגנון ה־client הקיים של ההרשמה. לשיפור ארכיטקטוני עתידי מומלץ להעביר את יצירת ה־Role ל־RPC או Edge Function עם בדיקת JWT, scope ו־idempotency.

## צעדים להשלמת בדיקת משתמש חדש

1. לצאת מהחשבון הקיים באתר.
2. ללחוץ על `המשך עם Google`.
3. לבחור `החלפת חשבון`.
4. להתחבר עם Gmail חדש.
5. לוודא שמופיע מסך בחירת סוג משתמש.
6. להשלים onboarding ולוודא מעבר ל־`/tasks`.

## תיקון nonce ו־origin

- נוצר Google OAuth Web Client ייעודי בשם `BZB GIS Direct`.
- הוגדרו origins מורשים ל־localhost (`8080`, `5173`), לדומיין הראשי, ל־`www` ול־Vercel.
- ה־Client החדש הוגדר ב־Supabase לצד ה־Client הקודם לצורך תאימות.
- כניסה ישירה עם Google ID token פועלת ללא nonce ידני. Google ו־Supabase מקבלים חוזה זהה ולכן לא נוצרת שגיאת `Nonces mismatch`.
- שרת הפיתוח מחזיר `Cross-Origin-Opener-Policy: same-origin-allow-popups` כדי לאפשר ל־popup של Google לתקשר עם החלון המקומי.
- לאחר אתחול נקי, כפתור Google נטען עם ה־Client החדש ללא שגיאת origin וללא כשל token בזמן טעינת העמוד.

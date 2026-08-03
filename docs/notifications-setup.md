# מערכת ההתראות — מדריך הפעלה ותחזוקה

מסמך תפעולי. התכנון העסקי נמצא ב־[notifications-plan.md](notifications-plan.md).

> ## ✅ סטטוס: המערכת מותקנת ופעילה
>
> ההתקנה בוצעה במלואה ב־1 באוגוסט 2026 על פרויקט `nrqgoaxraywprlbyzrso`, ונבדקה מקצה לקצה:
> מיילי התראות ומיילי אימות נשלחים בפועל ומגיעים לתיבה.
>
> **דומיין שולח — בוצע (2 באוגוסט 2026).** `bzb-web.com` מאומת ב־Resend,
> `RESEND_FROM_EMAIL="BZB <noreply@bzb-web.com>"`, ונבדקה שליחה בפועל לשתי כתובות
> שאחת מהן אינה בעל חשבון ה־Resend — שתיהן התקבלו. הבדיקה רצה דרך
> `email-selftest` (ראו סעיף 4.1).
>
> **Send Email Hook — הופעל (3 באוגוסט 2026).** `hook_send_email_enabled: true`.
> נבדק על מסלול `recover` של משתמש קיים ועל הרשמה חדשה — שניהם החזירו 200, כלומר
> ה־hook רץ ומחזיר תקין. באותה הזדמנות כובה `mailer_autoconfirm`, כך שהרשמה
> חדשה מחייבת אישור במייל. ראו סעיף 2.5.

הקוד כולו נמצא ב־main. סעיפים 2–3 מתעדים את מה שכבר בוצע — הם דרושים רק להקמת סביבה חדשה או לשחזור.

---

## 1. מה נבנה

### פונקציות שרת (Supabase Edge Functions)

| פונקציה | מה עושה | מי קורא לה |
|---|---|---|
| `send-auth-email` | משתלטת על כל מיילי האימות של Supabase ושולחת אותם ממותגים בעברית | Supabase Auth (Send Email Hook) |
| `notify-dispatch` | המפיץ המרכזי: קורא העדפות, מפעיל קיבוץ ושעות שקטות, שולח מייל ופוש | טריגר ב־DB דרך `pg_net` |
| `send-parent-digest` | בונה ושולח את הדוח היומי להורים | `pg_cron`, כל שעה |
| `push-subscribe` | רישום וביטול רישום של מכשיר לפוש | האפליקציה |
| `create-family-link-code` | *(קיימת)* עכשיו גם שולחת את הקוד למייל ההורה | האפליקציה |

מודולים משותפים ב־`supabase/functions/_shared/`: `email.ts` (תבנית + Resend), `push.ts` (VAPID), `notificationCopy.ts` (נוסח כל ההתראות).

**נמחק:** `send-password-reset` — קוד מת שאף אחד לא קרא לו.

### בסיס נתונים

| טבלה | תפקיד |
|---|---|
| `notifications` | ה־outbox וגם הפיד של הפעמון |
| `notification_preferences` | מתגי מייל/פוש לכל אירוע. שורה חסרה = ברירת מחדל |
| `notification_settings` | שעת דוח, שעות שקטות |
| `push_subscriptions` | מכשירים רשומים |
| `notification_deliveries` | יומן שליחה — למה נשלח / למה לא |

טריגרים שממלאים את `notifications`: `task_applications` (הוספה + שינוי סטטוס), `messages` (הוספה), `tasks` (מעבר ל־completed).

### צד לקוח

`/settings` (מסך ההגדרות), `/parent/report/:date` (מסך הדוח), פעמון ב־PageHeader, PWA מלא (`manifest.webmanifest` + `sw.js`), באנר התקנה, ומעקב נוכחות לצורך קיבוץ מיילי צ׳אט.

---

## 2. הפעלה — לפי הסדר

### שלב א׳: מפתחות Resend

```bash
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set PUBLIC_SITE_URL=https://bzb-2.vercel.app
```

⚠️ **ברירת המחדל היא `onboarding@resend.dev` — לפיתוח בלבד.** לפני עלייה לייצור:

```bash
supabase secrets set RESEND_FROM_EMAIL="BZB <noreply@your-domain.co.il>"
supabase secrets set RESEND_REPLY_TO=support@your-domain.co.il
```

ולאמת את הדומיין ב־Resend עם רשומות SPF, DKIM ו־DMARC. בלי זה המיילים נוחתים בספאם והדומיין צובר מוניטין שלילי שקשה מאוד לתקן.

### שלב ב׳: איחוד מיילי האימות

1. בדשבורד: **Authentication → Hooks → Send Email Hook**
2. סוג: HTTPS. כתובת: `https://<project-ref>.supabase.co/functions/v1/send-auth-email`
3. **Generate Secret** — להעתיק את הערך (בפורמט `v1,whsec_...`)

```bash
supabase secrets set SEND_EMAIL_HOOK_SECRET="v1,whsec_xxx"
supabase functions deploy send-auth-email --no-verify-jwt
```

`--no-verify-jwt` הכרחי: Auth קורא לפונקציה משרת לשרת בלי JWT של משתמש. מה שמאמת את הבקשה הוא חתימת ה־Standard Webhooks, שהפונקציה בודקת לפני כל פעולה.

### שלב ג׳: מיגרציות

```bash
supabase db push
```

### שלב ד׳: המפיץ

```bash
supabase secrets set NOTIFY_DISPATCH_SECRET="$(openssl rand -hex 32)"
supabase functions deploy notify-dispatch --no-verify-jwt
```

הטריגר ב־DB קורא את הכתובת ואת הסוד מ־Vault, כדי שלא יישמר סוד ב־git. ב־SQL Editor:

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/notify-dispatch', 'notify_dispatch_url');
select vault.create_secret('<אותו ערך של NOTIFY_DISPATCH_SECRET>', 'notify_dispatch_secret');
```

עד שהסודות האלה קיימים, הטריגר מחזיר `RETURN NEW` בלי לעשות כלום — התראות נרשמות בפעמון אבל לא נשלחות החוצה.

### שלב ה׳: פוש

```bash
npx web-push generate-vapid-keys
```

```bash
supabase secrets set VAPID_PUBLIC_KEY=xxx
supabase secrets set VAPID_PRIVATE_KEY=yyy
supabase secrets set VAPID_SUBJECT=mailto:support@your-domain.co.il
supabase functions deploy push-subscribe
```

את המפתח הציבורי צריך גם בצד הלקוח — ב־`.env` ובמשתני הסביבה של Vercel:

```
VITE_VAPID_PUBLIC_KEY=xxx
```

בלי המשתנה הזה מסך ההגדרות מציג "שירות ההתראות עוד לא מוגדר" ולא מנסה להירשם.

### שלב ו׳: הדוח היומי

```bash
supabase functions deploy send-parent-digest --no-verify-jwt
```

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-parent-digest', 'parent_digest_url');
```

ה־cron כבר מתוזמן במיגרציה (`5 * * * *`). בדיקה:

```sql
select * from cron.job where jobname = 'parent-digest-hourly';
```

---

## 2.5 מה בוצע בפועל (1 באוגוסט 2026)

| פריט | מצב | הערה |
|---|---|---|
| מיגרציות | ✅ הוחלו | `20260801120000`, `20260801130000` |
| `send-auth-email` | ✅ נפרסה | |
| `notify-dispatch` | ✅ נפרסה | |
| `send-parent-digest` | ✅ נפרסה | |
| `push-subscribe` | ✅ נפרסה | |
| `create-family-link-code` | ✅ נפרסה מחדש | עם שליחת קוד במייל |
| סודות Supabase | ✅ הוגדרו | VAPID (זוג מפתחות), `NOTIFY_DISPATCH_SECRET`, `SEND_EMAIL_HOOK_SECRET`, `PUBLIC_SITE_URL`. `RESEND_API_KEY` כבר היה קיים |
| סודות Vault | ✅ נוצרו | `notify_dispatch_url`, `notify_dispatch_secret`, `parent_digest_url` |
| Send Email Hook | ✅ פעיל (3 באוגוסט) | הופעל אחרי שהדומיין אומת. נבדק על `recover` ועל הרשמה חדשה — 200 בשניהם |
| `mailer_autoconfirm` | ✅ כובה (3 באוגוסט) | הרשמה חדשה מחייבת אישור במייל; המייל יוצא ממותג בעברית דרך ה־hook |
| cron הדוח היומי | ✅ מתוזמן | `parent-digest-hourly`, כל שעה ב־:05 |
| משתני סביבה ב־Vercel | ✅ הוגדרו | כל חמשת משתני `VITE_*` בשלוש הסביבות — Production, Preview, Development |
| דומיין שולח | ✅ בוצע (2 באוגוסט) | `bzb-web.com` מאומת; `RESEND_FROM_EMAIL="BZB <noreply@bzb-web.com>"`. נבדק בשליחה לכתובת שאינה בעל החשבון |

### תקרית 1 באוגוסט: ה־hook הופעל לפני שהיה דומיין מאומת (נפתר)

הסעיף הזה נשאר כתיעוד של הכשל ושל הלקח מהבדיקה. המצב עצמו נפתר ב־3 באוגוסט —
הדומיין מאומת, ה־hook פעיל, וההרשמה נבדקה מקצה לקצה.

ה־hook הופעל ב־1 באוגוסט והשבית את ההרשמה לכל המשתמשים. הסיבה:

**Resend במצב בדיקה (`onboarding@resend.dev`) שולח רק לכתובת של בעל חשבון ה־Resend.** כל נמען אחר נדחה. כשה־hook פעיל, Supabase Auth תלוי בו לגמרי — הוא מחזיר 500, וההרשמה נכשלת:

```
{"code":500,"error_code":"unexpected_failure",
 "msg":"Unexpected status code returned from hook: 500"}
```

מה שהסתיר את זה בבדיקות: כל בדיקות המייל הראשונות נשלחו ל־itayk93@gmail.com — שהיא בדיוק כתובת בעל החשבון, הכתובת היחידה שעובדת. הבדיקה נראתה ירוקה בזמן שהמערכת הייתה שבורה לכל השאר.

**הלקח:** בדיקת מייל חייבת לכלול נמען שאינו בעל החשבון, אחרת היא לא מוכיחה כלום.

בין 1 ל־3 באוגוסט ההרשמה עבדה כי ה־hook היה כבוי — Supabase שלח את מיילי האימות במנגנון המובנה שלו (תבנית ברירת מחדל באנגלית). זה מה שגרם למיילי איפוס סיסמה להגיע מ־`noreply@mail.app.supabase.io` במקום מהמערכת שלנו.

**סדר ההפעלה שבוצע בפועל ב־3 באוגוסט:**

1. לאמת דומיין ב־Resend (SPF, DKIM, DMARC)
2. `supabase secrets set RESEND_FROM_EMAIL="BZB <noreply@your-domain.co.il>"`
3. **לבדוק שליחה לכתובת שאינה בעל החשבון** — קריטי
4. רק אז להפעיל את ה־hook:

```bash
curl -X PATCH "https://api.supabase.com/v1/projects/nrqgoaxraywprlbyzrso/config/auth" \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"hook_send_email_enabled": true}'
```

5. **מיד אחרי — לנסות הרשמה עם כתובת זרה.** אם מתקבל 500, לכבות מיד את ה־hook

הסוד והכתובת של ה־hook נשמרו בהגדרות, אז ההפעלה היא שינוי של דגל אחד.

> **הערה על התראות המערכת:** הן לא מושפעות. `notify-dispatch` שולח ישירות דרך Resend בלי לעבור ב־Auth, ולכן הן ממשיכות לעבוד — אבל **גם הן יגיעו רק ל־itayk93@gmail.com** עד שיהיה דומיין. שליחה לכל נמען אחר תירשם ב־`notification_deliveries` כ־`email / failed`.

### מה נבדק בפועל

- **שרשרת ההתראות** — הוכנסה שורת בדיקה ל־`notifications`; הטריגר הפעיל את `pg_net`, המפיץ רץ, והמייל נשלח והגיע. `notification_deliveries` רשם `email=sent` ו־`push=skipped/no_devices` (נכון — אין מכשיר רשום)
- **מיילי אימות דרך ה־hook** — עבד לכתובת בעל חשבון Resend בלבד. נכשל לכל נמען אחר, ולכן ה־hook כובה. ראו האזהרה למעלה
- **אתחול הפונקציות** — כל שלוש הפונקציות המוגנות מחזירות 401 לבקשה לא חתומה, כלומר הן עולות והייבוא של `standardwebhooks` ו־`web-push` נפתר

### מה לא נבדק

- **פוש בפועל** — דורש מכשיר מותקן שנרשם. הצינור נבדק עד לנקודה שבה אין מנוי
- **הדוח היומי** — ירוץ בפעם הראשונה בשעה שנבחרה. דורש הורה עם ילד מקושר ופעילות באותו יום

---

## 2.6 משתני סביבה — קריטי

**כל משתני `VITE_*` חייבים להיות מוגדרים ב־Vercel, לא רק בקובץ `.env` המקומי.**

`.env` היה בעבר מקובץ במעקב git, וה־build ב־Vercel שאב ממנו את משתני Supabase. ברגע שהקובץ הוצא מהמעקב (הריפו ציבורי — אסור שיכיל מפתחות), ה־build נשאר בלי המשתנים והאתר קרס עם:

```
Uncaught Error: supabaseUrl is required.
```

התיקון: להגדיר את המשתנים ב־Vercel בשלוש הסביבות. המצב הנוכחי:

| משתנה | Production | Preview | Development |
|---|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | ✅ | ✅ |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | ✅ | ✅ |
| `VITE_SUPABASE_PROJECT_ID` | ✅ | ✅ | ✅ |
| `VITE_GOOGLE_MAPS_API_KEY` | ✅ | ✅ | ✅ |
| `VITE_VAPID_PUBLIC_KEY` | ✅ | ✅ | ✅ |

בדיקה מהירה:

```bash
vercel env ls | grep VITE_
```

**כשמוסיפים משתנה `VITE_*` חדש — להוסיף אותו ב־Vercel לשלוש הסביבות, אחרת הפריסה הבאה תישבר.** ה־CLI לא מצליח להוסיף ל־Preview בלי בחירת ענף אינטראקטיבית; דרך ה־API זה עובד:

```bash
curl -X POST "https://api.vercel.com/v10/projects/<projectId>/env?teamId=<orgId>&upsert=true" \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"key":"VITE_X","value":"...","type":"encrypted","target":["preview"]}'
```

---

## 3. כללי ההתנהגות

**קיבוץ מיילי צ׳אט.** פוש נשלח על כל הודעה; מייל נשלח רק אם *שני* התנאים מתקיימים: הנמען לא היה פעיל באפליקציה ב־10 הדקות האחרונות, ולא נשלח לו מייל על אותה שיחה בשעה האחרונה. בלי זה, שיחה חיה של 20 הודעות הייתה מייצרת 20 מיילים ושורפת את המכסה היומית.

**שעות שקטות.** חוסמות פוש בלבד. ההתראה עדיין נכנסת לפעמון והמייל עדיין נשלח — רק הצליל במכשיר נחסם. ברירת מחדל 22:00–07:00, לפי שעון ישראל.

**פוש רק באפליקציה מותקנת.** בקשת ההרשאה לא עולה בלשונית דפדפן רגילה — בשום פלטפורמה. באייפון זו ממילא דרישה של המערכת (Safari חושף `PushManager` רק לאפליקציות שנפתחות ממסך הבית), ובשאר הפלטפורמות זו החלטה מכוונת: בקשת הרשאה שקופצת בלשונית חולפת היא הדרך הקלאסית לקבל סירוב — **וסירוב הוא סופי, הדפדפן לא יאפשר לבקש שוב.** במקום זה מסך ההגדרות מסביר איך להתקין. הכלל אכוף בשני מקומות: ב־UI וגם ב־`subscribeToPush` עצמה.

**מנויי פוש מתים.** אם שרת הפוש מחזיר 404 או 410, המנוי נמחק מיד. אחרת כל שליחה עתידית הייתה מנסה שוב מול נקודת קצה מתה, לנצח.

**כפילויות.** `notification_deliveries` עם `UNIQUE (notification_id, channel)`, והמפיץ בודק מה כבר טופל לפני שהוא שולח. `pg_net` מנסה שוב כשיש timeout, אז בלי זה משתמש היה מקבל את אותו מייל פעמיים.

**ברירות מחדל.** שורה חסרה ב־`notification_preferences` פירושה "ברירת מחדל". הן מוגדרות פעמיים — ב־`_shared/notificationCopy.ts` (שרת) וב־`src/lib/notificationCopy.ts` (מסך ההגדרות). **שינוי באחת חייב להיות משוקף בשנייה.**

---

## 4. אבחון

**"למה לא קיבלתי מייל?"** — התשובה תמיד ב־`notification_deliveries`:

```sql
select n.event_type, d.channel, d.status, d.error, d.created_at
from notification_deliveries d
join notifications n on n.id = d.notification_id
where d.user_id = '<user-id>'
order by d.created_at desc
limit 20;
```

הערכים ב־`error` כשה־status הוא `skipped`:

| ערך | פירוש |
|---|---|
| `disabled` | המשתמש כיבה את הערוץ במסך ההגדרות |
| `batched` | מייל צ׳אט נחסך — המשתמש היה פעיל או שכבר נשלח מייל בשעה האחרונה |
| `quiet_hours` | פוש נחסם בשעות השקט |
| `no_devices` | אין מכשיר רשום לפוש |
| `not_configured` | חסרים מפתחות VAPID |
| `no_address` | אין כתובת מייל למשתמש |

**התראות נרשמות אבל כלום לא נשלח** — סימן שסודות ה־Vault חסרים. לבדוק:

```sql
select name from vault.secrets;
```

**אין כפתור להפעלת התראות במסך ההגדרות** — זה תקין כשהאפליקציה רצה בלשונית דפדפן. פוש מוצע רק לאפליקציה מותקנת; המסך מציג במקום זאת הסבר התקנה המותאם לפלטפורמה.

---

## 4.1 בדיקת שליחה — `email-selftest`

פונקציה תפעולית שמדווחת על הגדרות השולח ועל מצב האימות של הדומיין ב־Resend,
ואם ביקשת — שולחת את התבנית האמיתית לנמענים שתציין. מוגנת בסוד משותף
(`EMAIL_SELFTEST_SECRET`), בדיוק כמו שאר הפונקציות הלא־אינטראקטיביות.

בדיקת הגדרות בלבד, בלי לשלוח כלום:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/email-selftest" \
  -H "x-selftest-secret: $EMAIL_SELFTEST_SECRET" \
  -H "Content-Type: application/json" -d '{}'
```

שליחה בפועל — **תמיד עם נמען אחד לפחות שאינו בעל חשבון ה־Resend**:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/email-selftest" \
  -H "x-selftest-secret: $EMAIL_SELFTEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"to":["someone@example.com","other@example.com"]}'
```

התשובה מחזירה `config.sandboxSender` (האם עדיין `resend.dev`),
`config.sender.status` (`verified` או לא), ולכל נמען `ok` ומזהה ההודעה ב־Resend.

---

## 5. מגבלות ידועות

- **100 מיילים ביום** במסלול החינמי של Resend. הקיבוץ מקטין את הצריכה משמעותית, אבל צריך לעקוב
- **פוש דורש התקנה למסך הבית** — המייל והפעמון הם הערוצים העיקריים, הפוש תוספת
- **מגבלת קצב על מיילי אימות** — Supabase חוסם בקשות איפוס סיסמה תכופות מאותה כתובת (429). מגבלה של Supabase, לא של הקוד
- **`web-push` רץ דרך שכבת התאימות ל־Node** ב־Deno. אם היא נשברת בעדכון עתידי של Supabase, אפשר להחליף רק את `_shared/push.ts` — שאר המערכת לא נוגעת בזה

# מערכת ההתראות — מדריך הפעלה ותחזוקה

מסמך תפעולי. התכנון העסקי נמצא ב־[notifications-plan.md](notifications-plan.md).

> ## ✅ סטטוס: המערכת מותקנת ופעילה
>
> ההתקנה בוצעה במלואה ב־1 באוגוסט 2026 על פרויקט `nrqgoaxraywprlbyzrso`, ונבדקה מקצה לקצה:
> מיילי התראות ומיילי אימות נשלחים בפועל ומגיעים לתיבה.
>
> **הדבר היחיד שנשאר: דומיין שולח.** ראו סעיף 6.

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
| Send Email Hook | ✅ הופעל | דרך Management API |
| cron הדוח היומי | ✅ מתוזמן | `parent-digest-hourly`, כל שעה ב־:05 |
| `VITE_VAPID_PUBLIC_KEY` ב־Vercel | ⚠️ חלקי | הוגדר ל־Production ול־Development. **Preview לא הוגדר** — ה־CLI דורש בחירת ענף אינטראקטיבית. להוסיף ידנית בדשבורד אם רוצים פוש בפריסות תצוגה מקדימה |
| דומיין שולח | ❌ לא בוצע | עדיין `onboarding@resend.dev` |

### מה נבדק בפועל

- **שרשרת ההתראות** — הוכנסה שורת בדיקה ל־`notifications`; הטריגר הפעיל את `pg_net`, המפיץ רץ, והמייל נשלח והגיע. `notification_deliveries` רשם `email=sent` ו־`push=skipped/no_devices` (נכון — אין מכשיר רשום)
- **מיילי אימות** — בקשת איפוס סיסמה הפיקה מייל עם הנושא "איפוס הסיסמה שלכם ב־BZB". לפני ההפעלה הנושא היה "Reset your password" — ההוכחה שה־hook תפס
- **אתחול הפונקציות** — כל שלוש הפונקציות המוגנות מחזירות 401 לבקשה לא חתומה, כלומר הן עולות והייבוא של `standardwebhooks` ו־`web-push` נפתר

### מה לא נבדק

- **פוש בפועל** — דורש מכשיר מותקן שנרשם. הצינור נבדק עד לנקודה שבה אין מנוי
- **הדוח היומי** — ירוץ בפעם הראשונה בשעה שנבחרה. דורש הורה עם ילד מקושר ופעילות באותו יום

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

## 5. מגבלות ידועות

- **`onboarding@resend.dev`** — לפיתוח בלבד, חובה להחליף לפני ייצור
- **100 מיילים ביום** במסלול החינמי של Resend. הקיבוץ מקטין את הצריכה משמעותית, אבל צריך לעקוב
- **פוש דורש התקנה למסך הבית** — המייל והפעמון הם הערוצים העיקריים, הפוש תוספת
- **מגבלת קצב על מיילי אימות** — Supabase חוסם בקשות איפוס סיסמה תכופות מאותה כתובת (429). מגבלה של Supabase, לא של הקוד
- **`web-push` רץ דרך שכבת התאימות ל־Node** ב־Deno. אם היא נשברת בעדכון עתידי של Supabase, אפשר להחליף רק את `_shared/push.ts` — שאר המערכת לא נוגעת בזה

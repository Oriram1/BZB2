# סליקת מנויים (Cardcom) — מדריך הפעלה

התכנון ב־[cardcom-billing-plan.md](cardcom-billing-plan.md), שאלות פתוחות ללקוח ב־[cardcom-client-questions.md](cardcom-client-questions.md).

> ## סטטוס: הקוד כתוב ונבדק מקומית, עוד לא הופעל
>
> - מיגרציות: הוחלו על הפרויקט ב־30 בספטמבר 2026 (גרסאות 20260930160155 ו־20260930160226).
> - פונקציות: `deno check` ובדיקות יחידה עוברים. לא נפרסו.
> - לא בוצעה אף קריאה אמיתית ל־Cardcom. שמות השדות נלקחו מסכמת ה־OpenAPI הרשמית
>   (`https://secure.cardcom.solutions/swagger/v11/swagger.json`) ויש לאמת אותם מול מסוף בדיקה.

## מצב טסט / לייב

`BILLING_ENABLED` הוא מתג ראשי. כשהוא לא `true`, `billing-create-checkout` מחזיר 503 ו־`billing-renew` לא עושה דבר.
לבדיקות: `BILLING_ENABLED=true` יחד עם פרטי **מסוף הבדיקה** של Cardcom (לא המסוף החי). למעבר לייב מחליפים את שלושת ערכי המסוף
ומאשרים ללקוח. אין מצב "טסט" בקוד עצמו: ההפרדה היא לפי איזה מסוף מוגדר ב־secrets.

## מה נבנה

| רכיב | תפקיד |
|---|---|
| `billing-create-checkout` | יוצר הזמנה ודף תשלום מאוחסן ב־Cardcom. הסכום נלקח מ־`billing_plans`, דורש `accept_renewal: true` |
| `billing-webhook` | ההודעה של Cardcom. לא סומכת על הגוף: מוצאת את ההזמנה לפי `LowProfileId` ושואלת את Cardcom (`GetLpResult`) |
| `billing-confirm` | דף החזרה קורא לו. אותו אימות כמו ה־webhook, מי שמגיע ראשון מנצח |
| `billing-cancel` | ביטול בכל עת, וגם ביטול הביטול עד סוף התקופה |
| `billing-renew` | cron שעתי: שחזור הזמנות תקועות, סיום מנויים שבוטלו, חיוב חידושים, תזכורות |
| `billing-refund` | זיכוי (אדמין בלבד) שמסיים את המנוי |
| `apply_paid_order` (SQL) | המקום היחיד שהופך תשלום מוצלח לתקופה. אידמפוטנטי, בטרנזקציה אחת |

דפים: `/pricing` (הסכמה + מעבר לתשלום), `/billing/return` (אימות מול השרת), `/subscription` (ניהול המנוי, היסטוריה, ביטול, תשלום חוב).

## הפעלה — לפי הסדר

1. **מיגרציות.** להחיל את שתיהן לפי סדר:
   `20260930160155_billing_notification_events.sql` (ערכי enum בלבד) ואז `20260930160226_billing.sql`.
2. **Secrets לפונקציות** (הערכים במייל של Cardcom; לא להדביק בצ'אט ולא ל־git):
   ```bash
   supabase secrets set CARDCOM_TERMINAL=… CARDCOM_API_NAME=… CARDCOM_API_PASSWORD=…
   ```
   `CARDCOM_API_PASSWORD` נדרש רק לזיכויים. אחרי העלייה לאוויר מומלץ להחליף את הסיסמאות,
   כי הן עברו במייל בטקסט גלוי.
3. **חשבוניות.** `CARDCOM_ISSUE_DOCUMENTS=true` שולח `Document` ל־Cardcom ומפיק חשבונית
   בכל חיוב. דורש מודול חשבוניות במסוף, וסוג המסמך נקבע בפאנל של Cardcom (לא בקוד),
   כי הוא תלוי אם העסק עוסק פטור/מורשה. ברירת המחדל כבויה כדי שתשלום לא ייכשל על מסוף בלי מודול.
   **בלי הדגל לא יוצאות חשבוניות.**
4. **פריסת הפונקציות:** `billing-create-checkout`, `billing-confirm`, `billing-webhook`,
   `billing-cancel`, `billing-renew`, `billing-refund`. ה־`verify_jwt` כבר מוגדר ב־`config.toml`.
5. **Vault** (בשביל ה־cron), אותה שיטה כמו `parent_digest_url`:
   ```sql
   select vault.create_secret('https://<project>.functions.supabase.co/billing-renew', 'billing_renew_url');
   ```
   הסוד `notify_dispatch_secret` כבר קיים ומשמש גם כאן.
6. **בדיקה על מסוף בדיקה** לפני מסוף חי: רכישה, כשלון (כרטיס נדחה), ביטול, חידוש בכוח
   (להזיז `current_period_end` אחורה ולהריץ את `billing-renew`), וזיכוי.

## איך מטפלים בתקלות

- **שילם ואין מנוי.** `payment_orders` עם `status = 'failed'` ו־`error = 'amount_mismatch'` /
  `'order_mismatch'` מסמן תשלום שנדחה במכוון (נרשם ב־`billing_result_rejected`). דורש בדיקה ידנית וזיכוי.
- **חויב פעמיים על אותה תקופה.** ה־`billing_double_charge` בלוג ו־`error = 'period_already_paid'`
  בהזמנה. החיוב השני נשמר אבל לא מאריך; יש לזכות אותו דרך `billing-refund`.
- **הזמנה תקועה ב־`pending`.** `billing-renew` שואל את Cardcom (`GetTransactionByExternalUniqTran`)
  אחרי 10 דקות; דפי תשלום שלא הושלמו נסגרים אחרי 48 שעות, אחרי בדיקה אחרונה.
- **`payment_events`** מכיל את כל קריאות ה־webhook (הערכים שנטענו בלבד, לא כרטיסים).

## מה שההגדרה הנוכחית עושה, ואפשר לשנות

- חידוש: מיד בסוף התקופה, ניסיונות חוזרים אחרי 3 ו־7 ימים, ואז המנוי מסתיים. גישה נשמרת בזמן זה
  (`RETRY_OFFSETS_DAYS` ב־`_shared/billing.ts`, ו־`GRACE_DAYS` ב־`src/lib/billing.ts`).
- כל כשלון חיוב נחשב "רך" וננסה שוב. הקודים של Cardcom לדחייה קשה (כרטיס גנוב/חסום)
  לא מסווגים כרגע.
- תזכורת לפני חידוש: 7 ימים לשנתי, 3 לרבעוני (`billing_plans.renewal_reminder_days`).
- מחיר חידוש = המחיר הנוכחי ב־`billing_plans`, לא המחיר בעת הרכישה.

## מגבלות ידועות

- **אין עדכון כרטיס למנוי פעיל.** כרטיס אפשר להחליף רק אחרי כשלון חיוב (מסך המנוי,
  "לתשלום ועדכון כרטיס"). מנוי פעיל שהכרטיס שלו עומד לפוג יכול לבטל ולהירשם מחדש.
- **החלפת מסלול** (רבעוני ↔ שנתי) באמצע תקופה לא נתמכת: מבטלים, ורוכשים מחדש אחרי הסיום.
- **ביטול עסקה ב־14 ימים** מתבצע ידנית דרך `billing-refund` עד שהלקוח יחליט מה נחשב שימוש
  (שאלה 3 בקובץ השאלות).
- **הביטוח (5 ₪ לחודש)** לא נכלל בסליקה. הוא עדיין מופיע באתר (`Register`, `CreateTask`, `Pricing`,
  `Terms` סעיף 5) בלי שום מנגנון מאחוריו — ממתין להחלטת הלקוח (שאלה 5).
- **חיוב פעמיים אם זיכוי נכשל באמצע**: אם Cardcom זיכה אבל העדכון אצלנו נכשל, ניסיון שני יידחה
  ע"י Cardcom ולא יעדכן את ההזמנה. נדיר; מתקנים ידנית.
- **נוסח ההסכמה** ב־`CheckoutConsentDialog` והתקנון דורשים אישור עורך דין לפני עלייה לאוויר.

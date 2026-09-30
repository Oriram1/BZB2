# תוכנית – סליקת מנויים (Cardcom)

מסמך תכנון בלבד. אין בו שינויי קוד. החלטות שתלויות בלקוח נמצאות ב-[cardcom-client-questions.md](cardcom-client-questions.md).

## מסלולים

- חינם.
- רבעוני: 30 ₪ ל-3 חודשים.
- שנתי: 100 ₪ לשנה.
- ביטוח מטלות: מחוץ לתוכנית עד שיש מבטח מורשה (ראו שאלה 5 בקובץ ללקוח).

## Endpoints של Cardcom (API v11)

- `POST /api/v11/LowProfile/Create` – פתיחת דף תשלום מאוחסן (iframe או redirect), חיוב ושמירת טוקן, יצירת חשבונית.
- `POST /api/v11/LowProfile/GetLpResult` – אימות תוצאה בשרת לפי `LowProfileId`.
- `POST /api/v11/Transactions/Transaction` – חיוב טוקן בחידוש, עם `ExternalUniqTranId`.
- `POST /api/v11/Transactions/RefundByTransactionId` – זיכוי.
- `POST /api/v11/Transactions/GetTransactionByExternalUniqTran` – בירור מצב אחרי timeout.
- אופציונלי: `ListTransactions` להתאמה חודשית.

שמות השדות נלקחו מסיכום ה-swagger ויש לאמת אותם מול התיעוד הרשמי לפני מימוש.

## מבנה ב-Supabase

- טבלאות: `subscriptions`, `payment_orders`, `payment_events` (לוג גולמי), `payment_methods` (טוקן – גישה רק ל-service role).
- Edge functions: `billing-create-checkout`, `billing-webhook` (`verify_jwt=false`), `billing-renew` (cron יומי), `billing-cancel`.
- ה-webhook אינו נחשב אמין: אימות דרך `GetLpResult`, השוואת סכום ו-`ReturnValue` להזמנה, ו-idempotency לפי `DealNumber`.
- הסכום נקבע בשרת מטבלת מסלולים, לא מפרמטר של הלקוח.
- Secrets: `CARDCOM_TERMINAL`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`.

## חידוש וביטול

- חידוש אוטומטי, בהסכמה מפורשת (צ'קבוקס) לפני התשלום הראשון.
- ביטול בכל עת, בלחיצה אחת בתוך האפליקציה. הביטול עוצר חידוש והמנוי נשאר פעיל עד סוף התקופה ששולמה. אין החזר יחסי.
- ביטול עסקה ב-14 הימים הראשונים: לפי הכרעת הלקוח (שאלה 3 בקובץ ללקוח).

## דיווח למשתמש: מייל וגם הודעת push

כל אירוע בחיוב מדווח בשני ערוצים, מייל ו-push. התשתית קיימת (`notify-dispatch`, `push-subscribe`, `send-auth-email`).

- **תזכורת לפני חידוש:** 7 ימים לפני חיוב שנתי, 3 ימים לפני חיוב רבעוני.
- **חיוב הצליח:** אישור וקישור לחשבונית.
- **חיוב נכשל:** הודעה מיידית עם קישור מאובטח לעדכון כרטיס.
- **ניסיון חוזר נכשל:** תזכורת בכל ניסיון.
- **המנוי פג / עבר לחינם:** הודעה בסיום תקופת החסד.
- **ביטול:** אישור שהחידוש נעצר, עם תאריך סיום הגישה.
- **זיכוי:** אישור החזר.

הערה: עם כשלון "קשה" של כרטיס (למשל כרטיס חסום או גנוב) לא מנסים שוב אלא שולחים הודעה מיד.

## כשלון חיוב

- ניסיונות בימים 0, 3 ו-7, ובכל אחד מהם מייל ו-push.
- הגישה נשארת פעילה בתקופת החסד (7 ימים).
- אחרי 7 ימים: מעבר לחינם. שום דבר לא נמחק.
- מה קורה למטלות פעילות: לפי הכרעת הלקוח (שאלה 4 בקובץ ללקוח).

## סדר עבודה מוצע

1. תשובות הלקוח (בעלות המסוף, עמלת 3 ₪, ביטוח).
2. מיגרציות לטבלאות ו-RLS.
3. `billing-create-checkout` ו-`billing-webhook`, ובדיקה על מסוף בדיקה.
4. `billing-cancel` ומסך ניהול מנוי ב-`/profile`.
5. `billing-renew` והתראות מייל ו-push.
6. עדכון Pricing ו-Terms בהתאם.

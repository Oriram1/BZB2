# Session: Quiet-Hours Message Digest — 2026-08-02

## מה נעשה

### 1. תיקון React Router warnings
- הוספת `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` ל-`BrowserRouter` ב-`src/App.tsx:88`
- Commit: `a4ef9f5`

### 2. מחיקת קוד מת (28 קבצים)
- `src/App.css`, `src/components/NavLink.tsx`, `src/components/ui/use-toast.ts`
- 25 רכיבי shadcn/ui שלא היו בשימוש
- `public/placeholder.svg`, תמונה לא בשימוש מ-`public/lovable-uploads/`
- ייצוא `categoryIcon` שלא היה בשימוש מ-`src/lib/categories.ts`
- Commit: `fed23ad`

### 3. תכנון ומימוש Quiet-Hours Digest (E2E)

#### הבעיות שנמצאו
1. **שעות שקט מעולם לא עבדו** — `notification_settings` ריק לגמרי, אז `settings?.quiet_hours_enabled` תמיד `undefined`
2. **שעות שקט לא חסמו מייל** — החסימה הייתה רק בבלוק של push
3. **הלוג דרס את עצמו** — `batched` נדרס ל-`disabled` באותו upsert key

#### מה נבנה
- **`supabase/functions/_shared/quietHours.ts`** — מודול טהור: חישוב חלון שעות שקט, המרת שעות ישראל, קיבוץ הודעות לכרטיסי דייג'סט
- **`src/test/quietHours.test.ts`** — 12 טסטים (חלון שעובר חצות, חלון רגיל, המרת שעות, קיבוץ שיחות)
- **`supabase/functions/_shared/email.ts`** — `EmailCard` קיבל `url?` אופציונלי לקישור per-card
- **`supabase/functions/_shared/notificationCopy.ts`** — קופי email + push ל-`quiet_hours_digest`
- **`src/lib/notificationCopy.ts`** — קופי bell + `CHANNEL_DEFAULTS` (מירור)
- **`src/integrations/supabase/types.ts`** — `quiet_hours_digest` נוסף ל-enum
- **`supabase/functions/notify-dispatch/index.ts`** — שלושת הבאגים תוקנו:
  - ברירות מחדל ל-quiet hours כשאין שורה
  - חסימת מייל לצ'אט בזמן שעות שקט
  - סיבה אחת בלוג (לא יותר דריסה)
- **`supabase/functions/send-quiet-digest/index.ts`** — פונקציית collector: אוספת הודעות שנחסמו, מכניסה שורת `quiet_hours_digest` אחת. תומכת ב-`{user_id, force}` לבדיקה מיידית
- **`supabase/migrations/20260802120000_quiet_hours_digest_event.sql`** — ALTER TYPE
- **`supabase/migrations/20260802120100_quiet_digest_cron.sql`** — runner function + cron ב-`:10` כל שעה

#### Deployment
- שתי edge functions פרוסות: `notify-dispatch`, `send-quiet-digest`
- מיגרציות הורצו
- Vault secret `quiet_digest_url` נוצר
- Cron `quiet-digest-hourly` פעיל

#### Commits
- `16e984e` — Spec
- `f8ecfac` — Plan
- `6fd6eb7` — Implementation (all E2E)

## מגבלות ידועות
- **Resend בלי דומיין מאומת** — מיילים יעבדו רק ל-`itayk93@gmail.com`. ברגע שיאומת דומיין הכל יעבוד בלי שינוי קוד
- **Push דורש PWA** — חשבון בלי `push_subscriptions` יקבל `no_devices` בלוג

## איך לבדוק
1. שלח הודעה אחרי 22:00
2. בדוק ב-DB: `push: skipped/quiet_hours` + `email: skipped/quiet_hours`
3. הרצה כפויה:
```bash
curl -s -X POST "https://nrqgoaxraywprlbyzrso.supabase.co/functions/v1/send-quiet-digest" \
  -H "Content-Type: application/json" \
  -H "x-notify-secret: $NOTIFY_DISPATCH_SECRET" \
  -d '{"user_id":"<uuid>","force":true}'
```
4. צפה לפוש: "היו X הודעות חדשות 🌙"

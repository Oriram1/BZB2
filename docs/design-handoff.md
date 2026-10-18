# מסמך העברה למעצב — BZB

## טכנולוגיה
- Vite + React 18 + TypeScript, SPA עם react-router-dom v6
- Tailwind CSS + shadcn/ui (Radix) + lucide-react + class-variance-authority
- Supabase (auth, DB, edge functions), פריסה ב-Vercel
- RTL עברית: `<html lang="he" dir="rtl">`, פונט יחיד Heebo
- בדיקות: Vitest + Playwright + axe

## ספריית רכיבים ועיצוב קיים
- `src/components/ui/` — button, card, dialog, sheet, tabs, select, input, avatar, badge, switch, tooltip, toast/sonner ועוד
- טוקנים כ-CSS variables ב-`src/index.css`, ממופים ב-`tailwind.config.ts`
- primary כתום `25 100% 55%`, `--primary-ink` לטקסט כתום, `--trust` כחול, `--radius: 1rem`
- אנימציות: float, buzz, pop-in, slide-up, fade-in
- אין Figma. מסמכים: `docs/design-review.md`, `docs/accessibility-wcag-2-2-2026-08.md`

## רוחבי מסך ו-breakpoints
- דסקטופ + מובייל (mobile-first), יש PWA
- ברירת מחדל של Tailwind: sm 640, md 768, lg 1024, xl 1280, 2xl 1400
- שימוש בפועל: `sm:` ×78, `md:` ×28, `lg:` ×4
- `useIsMobile` ב-768 (מתחת = מובייל)
- בדיקות e2e: 390×844 מובייל, 1280×800 דסקטופ

## כללים רספונסיביים לשמירה
- RTL בשורש; מספרים, אימייל ו-URL נשארים LTR; עדיף logical properties
- מתחת ל-768 שדות קלט ב-16px (מניעת zoom ב-iOS)
- ללא גלילה אופקית במובייל
- `viewport-fit=cover` — לשמור safe-area ב-BottomNav
- ניגודיות: טקסט על כתום בדיו כהה; טקסט כתום רק `primary-ink`
- `prefers-reduced-motion` מכובד
- ניווט: BottomNav/MobileNav במובייל; תפקידים tasker / bee / parent / admin

## צילומי מסך (`live-screenshots/`, מהפרודקשן)
דסקטופ (1180px) ומובייל (390×844). הצילומים המלאים ב-`design-handoff.html`.

| מסך | דסקטופ | מובייל |
|---|---|---|
| רשימת משימות | tasks-desktop | tasks-mobile |
| המשימות שלי (bee) | my-tasks-desktop | my-tasks-mobile |
| צ'אט (bee) | chat-desktop | chat-mobile |
| פרופיל (bee) | profile-desktop | profile-mobile |
| הגדרות התראות | settings-desktop | settings-mobile |
| תוכניות מנוי | pricing-desktop | pricing-mobile |
| אדמין: סקירה | admin-overview-desktop | admin-mobile |
| אדמין: משתמשים | admin-users-desktop | admin-users-mobile |
| אדמין: מחירים | admin-pricing-desktop | admin-pricing-mobile |
| אדמין: משפחה, פעילות, לוג, ביקורות | admin-*-desktop | — |
| tasker: פרטי משימה | tasker-task-detail-desktop | tasker-task-detail-mobile |
| tasker: פרסום משימה (שלב 1/6) | tasker-create-task-desktop | tasker-create-task-mobile |
| tasker: המנוי שלי | tasker-subscription-desktop | tasker-subscription-mobile |
| tasker: המשימות שלי | tasker-my-tasks-desktop | tasker-my-tasks-mobile |
| tasker: פרופיל | tasker-profile-desktop | tasker-profile-mobile |
| tasker: צ'אט | tasker-chat-desktop | — |
| פרופיל ציבורי | public-profile-desktop | — |

צילומים ישנים מיולי ב-`visual-review/`: landing, login, register, auth, tasks-list, create-task, my-tasks, chat, profile.

## ממצאי UI
- אדמין במובייל: 7 לשוניות נדחסות לשורה אחת והתוויות חופפות
- המשימות שלי במובייל: טאבים צפופים, הטקסט נוגע בקצוות
- אין גלישה אופקית בפועל (`scrollWidth` = 390)

## מה עדיין חסר
- מסכי parent: `/parent`, `/parent/report/:date`, `/parent/view/:token` (דורשים חשבון הורה)
- פרסום משימה, שלבים 2-6: פרטים, תשלום, תיאום, תוספות, סיכום
- דפים ציבוריים עדכניים: landing, login, register, terms, privacy, 404
- מצבים: מודל, drawer ניווט, ריק, שגיאה, מפה
- מובייל: צ'אט tasker, פרופיל ציבורי, אדמין (משפחה, פעילות, לוג, ביקורות)
- שליחה למעצב: לטשטש אימיילים, טלפונים ושיחות אמיתיות בצילומים; להחליט על גישה לקוד (`Oriram1/BZB2` או zip בלי `.env`) ועל סביבת בדיקה עם נתוני דמה

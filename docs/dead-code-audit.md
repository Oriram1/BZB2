# דוח קוד מת

תאריך הבדיקה: 27 ביולי 2026

## מה נבדק

בדקתי את הדברים הבאים:
- גרף הנתיבים ב-[`src/App.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/App.tsx)
- עמודי האפליקציה תחת [`src/pages`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/pages)
- קומפוננטות משותפות תחת [`src/components/ui`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui)
- נקודות כניסה של הניווט והשלד של האפליקציה
- חבילות ב-`package.json`
- כיסוי זרימה קיים באמצעות בדיקות Playwright

ההבחנה בדוח:
- `קוד מת`: קבצים או יצואים שקיימים אבל לא מחוברים לשום דבר
- `תלויות מיותרות`: חבילות שמופיעות ב-`package.json` אבל לא זוהו בשימוש
- `קוד גנרי`: קומפוננטות כלליות שנשארו בכוונה לשימוש עתידי, ולכן לא בהכרח צריך למחוק

## מה מחקתי בפועל

1. [`src/pages/Index.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/pages/Index.tsx)
   - זה היה wrapper שמחזיר רק את `Landing`.
   - לא היה מחובר לגרף הנתיבים.
   - זה קוד מיותר בביטחון גבוה.

2. [`src/test/example.test.ts`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/test/example.test.ts)
   - זה היה טסט דמה שלא בדק התנהגות אמיתית.
   - לא היה לו ערך תפעולי.

## ממצאים בטוחים יחסית

### קבצי UI שלא נמצאה אליהם הפניה ישירה

הקבצים הבאים תחת [`src/components/ui`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui) לא נמצאו בשימוש ישיר בתוך `src` לפי סריקת imports:

- `accordion.tsx`
- `alert.tsx`
- `aspect-ratio.tsx`
- `breadcrumb.tsx`
- `carousel.tsx`
- `chart.tsx`
- `collapsible.tsx`
- `command.tsx`
- `context-menu.tsx`
- `drawer.tsx`
- `dropdown-menu.tsx`
- `form.tsx`
- `hover-card.tsx`
- `input-otp.tsx`
- `menubar.tsx`
- `navigation-menu.tsx`
- `pagination.tsx`
- `progress.tsx`
- `radio-group.tsx`
- `resizable.tsx`
- `scroll-area.tsx`
- `slider.tsx`
- `switch.tsx`
- `table.tsx`
- `toggle-group.tsx`

הערה חשובה:
- אלה לא בהכרח קבצים מיותרים באמת.
- בפרויקטים בסגנון shadcn נהוג להשאיר primitives כלליים כאלה למקרה שיידרשו בהמשך.
- לכן לא מחקתי אותם אוטומטית.

## מה בדקתי ולא מחקתי

הקבצים הבאים נראים אולי “כלליים”, אבל הם כן בשימוש ולכן לא נחשבים קוד מת:

- [`src/components/ui/alert-dialog.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/alert-dialog.tsx)
- [`src/components/ui/avatar.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/avatar.tsx)
- [`src/components/ui/badge.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/badge.tsx)
- [`src/components/ui/button.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/button.tsx)
- [`src/components/ui/calendar.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/calendar.tsx)
- [`src/components/ui/card.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/card.tsx)
- [`src/components/ui/checkbox.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/checkbox.tsx)
- [`src/components/ui/dialog.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/dialog.tsx)
- [`src/components/ui/input.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/input.tsx)
- [`src/components/ui/label.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/label.tsx)
- [`src/components/ui/password-input.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/password-input.tsx)
- [`src/components/ui/popover.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/popover.tsx)
- [`src/components/ui/select.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/select.tsx)
- [`src/components/ui/separator.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/separator.tsx)
- [`src/components/ui/sheet.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/sheet.tsx)
- [`src/components/ui/skeleton.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/skeleton.tsx)
- [`src/components/ui/sonner.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/sonner.tsx)
- [`src/components/ui/tabs.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/tabs.tsx)
- [`src/components/ui/textarea.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/textarea.tsx)
- [`src/components/ui/toast.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/toast.tsx)
- [`src/components/ui/toaster.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/toaster.tsx)
- [`src/components/ui/toggle.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/toggle.tsx)
- [`src/components/ui/tooltip.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui/tooltip.tsx)

## תלויות שנראות מיותרות

לפי `depcheck`, אלה החבילות שנראות לא בשימוש:

- `@hookform/resolvers`
- `@types/google.maps`
- `lottie-react`
- `next-themes`
- `zod`

ובתור devDependencies:

- `@tailwindcss/typography`
- `@testing-library/react`
- `autoprefixer`
- `postcss`

מה בדקתי לגביהן:
- עברתי על חיפוש ישיר בקוד.
- בדקתי קבצי תצורה רלוונטיים.
- ראיתי שחלק מהן יכולות להיות תלויות עקיפות או שמורות לעבודה עתידית.
- לכן לא מחקתי אותן אוטומטית.

נקודה אחת ספציפית:
- [`src/google-maps.d.ts`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/google-maps.d.ts) מתייחס ל-`@types/google.maps`, ולכן יש כאן זיקה ישירה לטיפוסים.
- אם רוצים למחוק את החבילה הזו, צריך קודם לוודא שהטיפוסים הגלובליים לא נדרשים בפועל לבנייה או ל-IDE.

## מסקנה מעשית

ברמת ביטחון גבוהה, שני הקבצים שנמחקו באמת היו קוד מת:
- [`src/pages/Index.tsx`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/pages/Index.tsx)
- [`src/test/example.test.ts`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/test/example.test.ts)

שאר הפריטים הם “מועמדים לבדיקה”, לא מחיקה עיוורת.

## אם רוצים לנקות עוד

הסדר הנכון להמשך:
1. לאמת אם `@hookform/resolvers`, `zod` ו-`@types/google.maps` באמת לא נדרשים לשום מסלול עתידי.
2. לעבור על primitives תחת [`src/components/ui`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/components/ui) רק אם יש רצון לצמצם bundle או להקשיח תחזוקה.
3. להחליף את [`src/test/example.test.ts`](/Users/itaykarkason/Python%20Projects/busybee-chore-connect/src/test/example.test.ts) בטסט אמיתי אם רוצים לשמור על מבנה בדיקות מלא.

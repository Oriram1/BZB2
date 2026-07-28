# Handoff לפריסה, מיגרציות ופונקציות

תאריך: 28.07.2026

## מצב נוכחי

- קוד עודכן מקומית ונבדק ב־build.
- מיגרציות קיימות כבר בריפו תחת `supabase/migrations/`.
- קיימת פונקציית Edge אחת:
  `supabase/functions/admin-reset-password`
- לא בוצעה פריסה חיה מהסביבה הזו, כי חסר קובץ `.env.supabase.local`.

## למה הפריסה חסומה כרגע

כדי לפרוס מיגרציות ופונקציות דרך Supabase CLI צריך קובץ `.env.supabase.local` עם:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`

הקובץ הזה לא קיים כרגע בריפו המקומי, ולכן לא בוצעו:

- `supabase db push`
- `supabase functions deploy`

## מה צריך לפרוס

### מיגרציות

- `20260324070645_39bf4ead-d3a2-4bae-9295-257f2de64f38.sql`
- `20260325144816_e0aebc2e-7381-49f3-8db7-c919766435eb.sql`
- `20260414192528_a5e59b35-aa28-4d70-8a15-c4aae7d06506.sql`
- `20260623202712_cd5cf7bd-428b-44da-90f1-a735a7e7a09e.sql`
- `20260623202723_b9574000-7049-44ce-8b65-53f5cd9df050.sql`

### פונקציות

- `admin-reset-password`

## פקודות פריסה כשיהיה `.env.supabase.local`

להריץ משורש הפרויקט:

```sh
/bin/zsh -lc 'set -a; source .env.supabase.local; set +a; supabase login --token "$SUPABASE_ACCESS_TOKEN" --name "$(basename "$PWD")" --yes'
/bin/zsh -lc 'set -a; source .env.supabase.local; set +a; supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD" --yes'
/bin/zsh -lc 'set -a; source .env.supabase.local; set +a; supabase db push --password "$SUPABASE_DB_PASSWORD" --yes'
/bin/zsh -lc 'set -a; source .env.supabase.local; set +a; supabase functions deploy admin-reset-password --project-ref "$SUPABASE_PROJECT_REF" --use-api --no-verify-jwt --yes'
```

## מה להגיד ל‑Lovable

טקסט מוכן לשליחה:

```text
Please pull latest code from GitHub and redeploy project.

Important changes included:
1. Auth loading and role resolution fixed, so protected routes now load correctly for newly registered users.
2. Reset password flow now has a real /reset-password route and UI.
3. Full task flow verified: create task -> apply -> accept -> open chat.
4. Parent registration added with /register/parent.
5. Parent dashboard no longer uses fake mock data. It now reads real data and shows a clear empty state when no parent_links exist.
6. New branded favicon added, replacing Lovable default favicon.

After pulling latest code:
- redeploy frontend
- make sure environment variables stay unchanged
- if Supabase migrations are managed on your side, sync repo migrations before production deploy
- if parent dashboard should show real children, create parent_links rows between parent users and child users
```

## מה נשאר אחרי הפריסה

- ליצור `parent_links` אמיתיים כדי שהורה יראה ילדים.
- להחליט אם רוצים ממשק ניהול ליצירת `parent_links` מתוך האפליקציה, או להשאיר זאת כפעולה ידנית ב־DB/Admin.
- אם רוצים פריסת Supabase מלאה מהסביבה המקומית, להוסיף `.env.supabase.local`.

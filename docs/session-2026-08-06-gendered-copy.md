# Session: Removing Gendered Slash Forms From the UI (2026-08-06)

## The problem

The public profile screen read **"חבר/ה מאז 31.07.2026"**. The app stores every
user's gender (`profiles.gender`, added in `20260803170000_profile_gender.sql`)
and already inflects notification copy off it through `src/lib/gender.ts` — but
several screens had never been wired to that vocabulary and still wrote the
slash form, which reads like a form letter rather than like the app talking to a
person it knows.

This session swept the codebase for `[א-ת]/[א-ת]` and fixed every occurrence
where the gender was in fact available.

## Vocabulary added

`src/lib/gender.ts`, mirrored verbatim into `supabase/functions/_shared/gender.ts`
(the `architecture-invariants` test fails if the two copies drift):

| Group | Word | male / female / plural |
|---|---|---|
| `SUBJECT` | `deleted` | מחק / מחקה / מחקו |
| `SUBJECT` | `earned` | הרוויח / הרוויחה / הרוויחו |
| `SUBJECT` | `member` | חבר / חברה / חבר/ה |
| `SUBJECT` | `user` | המשתמש / המשתמשת / המשתמש/ת |
| `RECIPIENT` | `interested` | מעוניין / מעוניינת / מעוניין/ת |
| `RECIPIENT` | `agree` | מסכים / מסכימה / מסכים/ה |

`SUBJECT` is said *about* a third party, `RECIPIENT` is said *to* the person
being addressed. The plural column is the fallback for `unspecified` and for
anyone the app cannot identify — that is the only place a slash form is still
legitimate.

## Call sites fixed

| File | Was | Whose gender |
|---|---|---|
| `src/pages/PublicProfile.tsx` | חבר/ה מאז | the profile being viewed |
| `src/pages/ParentView.tsx` | הרוויח/ה | the child behind the share token |
| `src/pages/TaskDetail.tsx` | אני מעוניין/ת לבצע | the signed-in user |
| `src/components/tasks/MapView.tsx` | אני מעוניין/ת | the signed-in user |
| `src/pages/Register.tsx` | אני מסכים/ה לקבל עדכונים | inflects live off the gender picker on the same form |
| `supabase/functions/admin-manage-users/index.ts` (×6) | מחק/ה, שלו/ה, המשתמש/ת | the user who deleted their own account |

## Data plumbing this required

Two of those screens could not see the gender at all, so it had to be carried to
them:

1. **`get_public_profile`** — new migration
   `supabase/migrations/20260806090000_public_profile_gender.sql` drops and
   recreates the RPC with `gender` in its return set (a `RETURNS TABLE` signature
   cannot be widened with `CREATE OR REPLACE`). The matching entry in
   `src/integrations/supabase/types.ts` was updated by hand.
2. **`parent-view` edge function** — now selects `gender` from the child's
   profile and returns it inside the `child` object.

### Privacy note

`get_public_profile` is granted to `anon`, so gender is now readable by anyone
holding a user id. This is consistent with the privacy policy, which already
lists gender as collected "לצורך התאמת הממשק ללשון הפנייה בעברית" — but it is a
widening of what the public endpoint exposes and is recorded here deliberately.

## Guard against regression

`src/architecture-invariants.test.ts` already failed the build on slash forms in
the two `notificationCopy.ts` files. The list was extended to cover
`admin-manage-users/index.ts`, `PublicProfile.tsx`, `TaskDetail.tsx`, and
`MapView.tsx` — every file where the person's gender is known by construction.

## Deliberately left as slash forms

These describe someone the app genuinely cannot identify. Inflecting them would
mean guessing:

- `src/pages/Auth.tsx`, `src/pages/Profile.tsx` — a parent contact with no account
- `src/pages/ParentalHub.tsx`, `src/pages/ParentView.tsx` — error states rendered
  before any profile has loaded
- `src/components/profile/ParentShareLink.tsx` — the parent who will scan the QR
- `src/pages/CreateTask.tsx` — the worker who has not applied yet
- `src/pages/Terms.tsx`, `src/pages/PrivacyPolicy.tsx` — an anonymous reader
- `supabase/migrations/20260801120000_notifications.sql` — `COALESCE(child_name, 'הילד/ה')`,
  a fallback for a missing *name*, not a gender guess

## Verification

- `npx tsc --noEmit` — clean.
- `npx vitest run src/architecture-invariants.test.ts` — 16/17 pass. The single
  failure is pre-existing and unrelated: `notify-parent-signin` has no
  `[functions.notify-parent-signin] verify_jwt = true` block in
  `supabase/config.toml`.

## Deployed

Everything in this session is live on project `nrqgoaxraywprlbyzrso`.

`supabase db push` needed `--include-all`: `20260806090000_public_profile_gender.sql`
carries an earlier timestamp than the last migration already on the remote, so
the CLI refuses to insert it into history without the flag. The migration only
redefines a function and has no ordering dependency, so applying it out of order
is safe. That same push also applied `20260806140000_parent_view_token.sql`,
which the previous session had committed but never deployed — the outstanding
item recorded at the end of `session-2026-08-06-drawer-notifications.md`.

The `parent-view` and `admin-manage-users` edge functions were redeployed so
they pick up the new `_shared/gender.ts` vocabulary and the child-gender field.

Verified against the live database — `get_public_profile` now returns
`user_id, first_name, last_name, avatar_url, gender, created_at`.

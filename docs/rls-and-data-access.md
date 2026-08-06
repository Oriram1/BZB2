# RLS and data access

How to read and write data in this app without fighting the database — or worse,
without appearing to win and silently getting nothing.

Every table has RLS on. The client talks to PostgREST directly, so **RLS is the
authorization layer, not a second opinion on one**. Route guards and `RoleGuard`
decide what to render; they decide nothing about what a request may do.

---

## The one thing that causes most bugs

**A read blocked by RLS is not an error. It returns zero rows.**

There is no exception, no `error` object, no 403. `select()` gives `[]` and
`maybeSingle()` gives `null`, exactly as if the row did not exist. Every symptom
below has been a real bug in this codebase:

| Symptom | Actual cause |
| --- | --- |
| A name renders as a fallback (`משתמש Busy Bee`) forever | Read a profile with no relationship to it |
| A "is this taken?" count is always 0 | Uniqueness check against rows RLS hides |
| A list is empty for one role and full for another | Policy is relationship-based, not role-based |
| A write "succeeds" but nothing changes | `UPDATE ... WHERE` matched zero visible rows |

When something is mysteriously empty, suspect RLS before suspecting the query.

---

## Table-by-table

### `profiles` — the one to be careful with

Readable **only** when you are related to its owner:

- it is your own profile, **or**
- you are an admin, **or**
- you are that person's linked parent (`parent_links`), **or**
- you share a conversation with them, **or**
- one of you applied to a task the other created.

A visitor browsing a task has **none** of these with the publisher.

**Therefore: to show a stranger's name or avatar, call the RPC.**

```ts
const { data } = await supabase.rpc("get_public_profile", { _user_id: someId });
const profile = Array.isArray(data) ? data[0] : data;
```

`get_public_profile` is `SECURITY DEFINER`, granted to `anon` and
`authenticated`, and returns only `user_id, first_name, last_name, avatar_url,
created_at` — no phone, no address, no age. That column list is the privacy
boundary; widen it only deliberately.

Enforced by `architecture-invariants.test.ts`: `TaskDetail.tsx` may not contain
`.from("profiles")`.

Reading the table directly is correct **only** for your own row, or where the
relationship above provably holds (a task creator reading their own applicants).

### `tasks`

- **SELECT** — everyone, including signed-out visitors.
- **INSERT** — `auth.uid() = creator_id` **and** the caller holds the `tasker`
  role. Client-side gating alone once let two `bee` accounts create tasks.
- **UPDATE / DELETE** — creator only.

### `task_applications`

- **SELECT** — the applicant, or the creator of the task applied to.
- **INSERT** — `auth.uid() = applicant_id`.
- **UPDATE** — the task's creator (accept / reject).

### `parent_links` / `parent_contacts`

- `parent_links` — visible to both sides. **No self-service INSERT**: links are
  created only by `redeem_family_link_code` (service role) or by an admin.
- `parent_contacts` — an email with no account behind it. The child may
  `SELECT`, `INSERT`, `DELETE` their own rows. **There is deliberately no
  `UPDATE` policy and no `UPDATE` grant**, because `last_notified_at` is the
  notifier's throttle; a child who could reset it could mail their parent on
  every sign-in. A trigger caps it at 3 contacts per child.

### `conversations` / `messages`

Participants only, on both read and write.

### `user_roles`

- **SELECT** — your own roles, or all of them if you are an admin.
- **INSERT** — your own row only, and the `prevent_role_escalation` trigger then
  enforces the real rules: one functional role (`tasker` / `bee` / `parent`) per
  account forever, and `admin` is never self-assignable.
- **UPDATE / DELETE** — revoked from `anon` and `authenticated` outright. Role
  changes go through `switch_my_role`.

### Notification tables

`notifications`, `notification_preferences`, `notification_settings`,
`notification_deliveries`, `push_subscriptions` — all scoped to
`auth.uid() = user_id`. Rows are created by triggers via `enqueue_notification`,
never by the client.

### Log tables

- `user_activity_log` — you may insert your own rows and read your own; admins
  read everything.
- `admin_audit_log` — admin-only.
- `archived_records` — service role inserts only.

---

## Soft delete: `archived_at`

Delete does not delete. `archive_task()` and `admin_archive_task()` stamp
`archived_at` on the task **and its applications**; the rows stay.

**Every read of `tasks` or `task_applications` meant for a person must filter:**

```ts
.is("archived_at", null)
```

RLS does not do this for you. Screens that forgot it listed deleted tasks whose
own detail page then refused to open them, and counted them in the stats.
`architecture-invariants.test.ts` now fails any select in the reader screens that
omits the filter. Write paths need it too — do not let someone cancel a task that
was already deleted.

---

## System-owned columns

RLS says who may touch a row. `prevent_client_system_column_changes` says which
fields, and it applies to the owner as well:

| Table | Frozen after insert |
| --- | --- |
| `profiles` | `user_id`, `created_at` |
| `tasks` | `id`, `creator_id`, `created_at`, `views_count` |
| `task_applications` | `id`, `task_id`, `applicant_id`, `created_at` |
| `messages` | `id`, `conversation_id`, `sender_id`, `created_at` |
| `parent_links` | `id`, `parent_user_id`, `child_user_id`, `created_at` |

`views_count` has one legal writer: `record_task_view()`, which signals itself
with a transaction-local setting (`app.counting_view`) that no client can set.
Counting is per (task, viewer), never the creator's own visit.

---

## When to add an RPC instead of a policy

Reach for a `SECURITY DEFINER` function when the client needs a **narrow answer**
derived from rows it must not be able to browse:

| Function | Why it exists |
| --- | --- |
| `get_public_profile` | Public name/avatar without exposing the profile table |
| `get_worker_completed_task_count` | A number, not the underlying task list |
| `record_task_view` | Writes a column the owner cannot write |
| `archive_task` / `admin_archive_task` | Multi-table transaction + audit log |
| `switch_my_role` | Role change under invariants a policy cannot express |
| `redeem_family_link_code` | Creates a link neither side may insert directly |

Rules for adding one:

1. `SET search_path = public` — always.
2. `REVOKE ALL ... FROM PUBLIC`, then `GRANT EXECUTE` to the narrowest role.
3. Re-check authorization **inside** the function. `SECURITY DEFINER` bypasses
   RLS, so the function is now the only thing standing there.
4. Return the least data that answers the question.

---

## Edge functions

`config.toml` sets `verify_jwt = true` for every user-facing function. The four
exceptions — `send-auth-email`, `notify-dispatch`, `send-parent-digest`,
`send-quiet-digest` — are machine-to-machine and authenticate with a webhook
signature or a shared secret instead. `architecture-invariants.test.ts` asserts
this; keep new user-facing functions explicit rather than relying on a default.

### Why `verify_jwt = false` is not a hole

The flag turns off JWT checking **at the Supabase gateway only**. It does not
make the function public, and `true` is not an available alternative for these
four: none is called from a browser, so no caller has a user JWT at all.
`send-auth-email` is invoked by Supabase Auth as a Send Email Hook; the other
three by `pg_net` from a database trigger or by cron. A gateway that demanded a
JWT would reject every legitimate call.

The question that matters is whether the function authenticates itself. Each
does, and each was verified live with an unauthenticated request:

| Function | Mechanism | Unauthenticated call |
|---|---|---|
| `send-auth-email` | Standard Webhooks signature over `SEND_EMAIL_HOOK_SECRET` | `401 invalid_signature` |
| `notify-dispatch` | shared secret in `x-notify-secret` | `401 unauthorized` |
| `send-parent-digest` | same secret | `401 unauthorized` |
| `send-quiet-digest` | same secret | `401 unauthorized` |

Two properties of this arrangement are worth knowing before extending it:

- **The secret comparison is not constant-time.** The three digest functions use
  `req.headers.get("x-notify-secret") !== expectedSecret`, which leaks a timing
  side channel in principle. Over HTTP, against network jitter, exploiting it is
  impractical, so it is left as is — a considered trade-off, not an oversight.
  `timingSafeEqual` closes it cheaply if you want the guarantee.
- **Three functions share one secret** (`NOTIFY_DISPATCH_SECRET`). A leak of one
  exposes all three. Splitting them costs little if their blast radii ever
  diverge.

A new function may only take `verify_jwt = false` if it likewise has no browser
caller *and* authenticates by signature or secret on its own.

Inside a function, `admin` is the service-role client and **bypasses RLS
entirely**. Do not create it before authorization is settled, and never let a
caller-supplied id decide which rows it touches without checking that caller
first.

---

## Checklist for a new table

- [ ] `ENABLE ROW LEVEL SECURITY`
- [ ] Grant only the verbs the client actually needs — omitting `UPDATE` is a
      real access control, not an oversight
- [ ] `service_role` gets what the edge functions need, nothing else
- [ ] Policies scoped `TO authenticated` (or `anon`) rather than left open
- [ ] Soft-delete column? Then say so here and add the filter to the invariant test
- [ ] Any column the client must not write? Add it to the protect trigger
- [ ] Anything needing data across a relationship boundary? RPC, not a wider policy

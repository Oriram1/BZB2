# Parent Email Subscriptions (2026-08-07)

Lets a parent without an account choose which emails they get about their child,
and lets a second parent ask to be added to the list — from the public page at
`/parent/view/:token`.

## The finding that shaped this

A `view_token` is a column on a `parent_contacts` row, and that row is created by
**the child** typing a parent's address into their profile. So anyone opening
`/parent/view/:token` arrived through a link belonging to an address that is
*already* subscribed. "Let the parent subscribe" was not the missing piece.

What was actually missing:

- **No preferences at all.** `parent_contacts` held `email`, `child_user_id` and
  `last_notified_at` — nothing about which events to send. The only email a
  contact-parent received was the sign-in notice.
- **No way for a second parent to get on the list.** The QR gets forwarded; the
  person who receives it has no path except asking the child in person.

## The constraint everything else bends around

The page is public and unauthenticated. A form that writes into a minor's
`parent_contacts` would let anyone holding the link attach an address to that
child's activity — and the child is the only party meant to control that list.
`parent_contacts` deliberately has no UPDATE policy and grants nothing to `anon`.

**Holding the share token proves you were given the link. It does not prove the
child wants you watching them.** Those are separate facts, and only the child can
supply the second. That is why adding an address is a *request*, not a write.

## Design

### Preferences: five booleans on `parent_contacts`

```
notify_signin     default true
notify_accepted   default true
notify_digest     default true
notify_completed  default false
notify_cancelled  default false
```

Explicit columns rather than jsonb, mirroring `notification_settings`: the
notifier filters on them in SQL, and a typo in a column name fails loudly where a
typo in a jsonb key fails silently.

`completed` and `cancelled` default off. A parent emailed on every task mutes the
channel, and a muted channel delivers nothing — the same reasoning already
written at the top of `send-parent-digest`.

### Requests: a separate table, not a status column

`parent_contact_requests` holds pending asks. Deliberately **not** a `status`
column on `parent_contacts`: an unapproved address sitting in that table is one
forgotten `WHERE` clause away from being mailed, and it belongs to someone the
child never approved. A separate table makes that mistake unrepresentable rather
than merely unlikely.

No status column on the request either — approve inserts the contact and deletes
the request; reject just deletes.

### Flow for adding an address

1. Parent submits an address on the public page.
2. `request-parent-contact` (no JWT; the share token is the credential) validates,
   checks ceilings, inserts into `parent_contact_requests`.
3. It writes a `parent_contact_requested` notification **to the child**, which
   reaches their bell, email and push through the existing dispatcher — no new
   pipeline.
4. The child approves or rejects in their profile. Approval calls the existing
   `add-parent-contact`, so an approved parent gets exactly the same welcome
   email and share link as one the child typed in — no duplicated code path.

RLS: the child may SELECT and DELETE their own requests. **No INSERT policy and
no INSERT grant to `anon` or `authenticated`** — the only writer is the function,
which holds `service_role` and has verified a token first.

### Preferences UI

Read piggybacks on `parent-view`, which already loads the row. Writes go through
a new `parent-prefs` function with an **allow-list** of five columns — a spread of
the request body would let a caller write `last_notified_at` and reset their own
throttle. Each token sees only its own row, so a parent learns nothing about who
else is on the child's list.

### Delivery: `notify-dispatch` fans out

A parent contact has no `auth.users` row, so nothing about them can ride the
`notifications` table (keyed by `user_id`). But every event they care about is
already a notification for their child. Rather than a second queue with its own
triggers, the dispatcher forwards:

| Child's event | Parent receives | Gate |
|---|---|---|
| `application_decided` (accepted only) | `parent_child_accepted` | `notify_accepted` |
| `task_completed` | `parent_child_completed` | `notify_completed` |
| `task_cancelled` | `parent_child_cancelled` | `notify_cancelled` |

Two guards that are easy to miss:

- **Rejections are not forwarded.** A rejected application is the child's
  business. Only `status === "accepted"` fans out.
- **`task_completed` is enqueued to the task's creator as well as its workers.**
  A parent should hear about tasks their child *did*, not tasks their child
  *posted*, so the creator's copy is dropped by comparing against `tasks.creator_id`.

**Idempotency:** `pg_net` retries dispatch. The fan-out piggybacks on the email
channel's existing `notification_deliveries` marker — `alreadyHandled` is read
before the email block writes to it, so the fan-out runs exactly once per
notification. It is gated on the marker, not on whether the child's own email
went out: a child who muted their email has not muted their parent's.

`parent_child_completed` and `parent_child_cancelled` are **copy-only** event
types, like `parent_contact_added` and `child_signed_in` before them — they exist
in the edge-function copy module and have no row in the `notification_event` enum,
because they are mailed to an address rather than stored against an account.

### Digest

`send-parent-digest` read `parent_links` only, so contact-parents never got it.
It now also mails contacts with `notify_digest`, at the default hour — the only
hour someone with no `notification_settings` row has any way of choosing. The
existing "nothing happened today → send nothing" rule is preserved.

### Limits

- Existing 3-contact ceiling stands; a matching 3-pending-request ceiling is
  enforced by a trigger modelled on `enforce_parent_contact_limit`.
- One request per child per 10 minutes, throttled on the **token, not the email**,
  so retyping a different address cannot be used to spam the child's bell.
- An address already on the list, or already requested, returns a calm status
  rather than an error.

### Language

The requester is a stranger who typed an address, so there is no gender to
inflect on. That copy is **passive** ("התקבלה בקשה מהכתובת…") rather than falling
back to a plural verb that would read wrong ("מישהו מבקשים"). See
`session-2026-08-06-gendered-copy.md`.

## Files

**Migrations**
- `20260806220000_parent_contact_requested_event.sql` — enum value, alone in its
  own file because Postgres forbids using a new label in the transaction that
  adds it, and Supabase runs each migration in one transaction
- `20260806220100_parent_contact_prefs_and_requests.sql` — columns, table, RLS,
  trigger, grants

**New edge functions** — `request-parent-contact`, `parent-prefs`
**Changed** — `parent-view`, `notify-parent-signin`, `notify-dispatch`,
`send-parent-digest`, both `notificationCopy.ts` mirrors
**New components** — `ParentNotificationPrefs`, `ParentSubscribeCard`
**Changed pages** — `ParentView.tsx`, `Profile.tsx`

## Bug found and fixed on the way

`send-parent-digest` used `say`, `formFor` and `SUBJECT` throughout
`buildChildCard` but **never imported them**. Every run threw `ReferenceError`
before building a single card, so the daily parent digest has been dead since the
gender rewrite. Confirmed against `HEAD` before touching it. Imports added.

## Verification

- `npx tsc --noEmit` — clean, against types regenerated from the live schema.
- `npx vitest run` — 51 passed, 8 skipped.
- Two new authorization invariants: the request queue is never INSERT-able by a
  client, and `parent_contacts` is never UPDATE-able by one. Both were
  mutation-tested — loosening the grant makes them fail — so they are guards, not
  decoration.
- Endpoints smoke-tested live: bad token → `invalid_token`, bad address →
  `invalid_email`, a body containing only non-editable keys → `no_valid_prefs`.

**Not verified:** the happy path with a real token. There is no service-role key
in the local environment to mint a test contact with, and production is not the
place to create fake rows. The schema is confirmed — the regenerated types came
from the live database — but the first real approval and the first fan-out email
should be watched.

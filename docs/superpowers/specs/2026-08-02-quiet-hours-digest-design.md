# Quiet-hours digest

Messages that arrive while someone is asleep should not vanish. This design
holds them back overnight and delivers one summary in the morning: a push that
says how many arrived, and an email that says who sent them and links to each
conversation.

## Why this is more than a new feature

The trigger for the work was a night with no notifications, assumed to be quiet
hours doing their job. The delivery log says otherwise. The three messages
landed at 21:54, 21:55 and 21:56 — before quiet hours begin — and no row in
`notification_deliveries` has ever carried `error = 'quiet_hours'`.

Three defects explain that, and all three have to be fixed before a morning
digest has anything to collect.

**Quiet hours never engage.** The dispatcher reads
`settings?.quiet_hours_enabled` from `notification_settings`. That table is
empty. A row is written only when a user opens Settings and changes something,
so the column's `DEFAULT true` never materialises and the check is `undefined`
for every account.

**Quiet hours were never meant to hold email.** The suppression branch sits
inside the push block alone, with a comment saying the email still goes out and
only the buzz is withheld. That is a deliberate past decision, and it is the
opposite of what this feature needs.

**The delivery log overwrites its own diagnosis.** When the chat batching rule
declines an email it records the reason `batched`, then a few lines later an
unguarded `else if` upserts the same row with `disabled`. The upsert conflicts
on `(notification_id, channel)`, so the true reason is destroyed. Every email
skip in the database currently reads `disabled` regardless of cause, which is
why the initial read of the data was wrong.

## Part A — make quiet hours real

**A1. Default the missing settings row.** Treat an absent `notification_settings`
record as enabled, 22:00 to 07:00, resolved in the dispatcher rather than by
backfilling the table. The notifications migration already states this
philosophy for `notification_preferences`: sparse on purpose, a missing row
means use the default. Applying the same rule here needs no backfill and no
trigger on user creation.

**A2. Extend suppression to email, for chat only.** During quiet hours a
`message_received` notification withholds both channels. Every other event type
keeps today's behaviour — push held, email sent. This exception is not tidiness:
`family_link_code` carries a code that expires in ten minutes, so deferring it
until morning would deliver a dead code and break family linking outright.

**A3. Log one reason, once.** Collapse the email decision into a single `reason`
variable resolved before any write, so `batched`, `disabled`, `quiet_hours` and
`no_address` each survive into the log.

## Part B — the digest

A new event type, `quiet_hours_digest`, and a new edge function,
`send-quiet-digest`, built on the pattern `send-parent-digest` already
establishes: pg_cron fires hourly, and each run serves only the users whose
configured hour matches the current hour in Israel. Per-user scheduling stays
out of Postgres.

Each run, for every user whose `quiet_hours_end` equals the current hour:

1. Find `message_received` notifications for that user that are still unread and
   whose push delivery was logged with `error = 'quiet_hours'`.
2. Group them by `data->>conversation_id`, carrying the sender's name and count.
3. Insert **one** row into `notifications` with the grouped payload.

The existing dispatcher takes it from there and sends push and email on its own.
No new sending code exists anywhere in this feature.

Two rules borrowed from the parent digest: nothing held back means no
notification at all, because an empty digest is the noise that makes people mute
a channel; and the run is idempotent per user per day, guarded by checking for an
existing `quiet_hours_digest` whose `data->>date` is today.

### Copy

Push reads `היו 3 הודעות חדשות 🐝` and opens `/chat`. Email carries one card per
conversation — sender, how many messages, and a link straight to that
conversation.

Per-conversation links need a change to the shared email layer: `EmailCard` has
a title and lines but no URL of its own, and the template renders a single
action button for the whole message. Adding an optional `url` to `EmailCard`,
rendered as a linked title, keeps the digest's links where they belong and is
reusable by the parent digest later.

### Testing hook

The function accepts an optional `{ user_id, force }` body behind the existing
`x-notify-secret` header, running the digest for one user regardless of the
hour. Without it, verifying a change means waiting for 07:00.

## Testing

The hour-window arithmetic and the grouping of notifications into cards are pure
functions and get vitest coverage: quiet windows that wrap midnight, a user
whose window does not wrap, an empty collection producing no digest, and
multiple conversations collapsing into distinct cards. The dispatcher's reason
resolution gets the same treatment, including the case that previously lost
`batched`.

End-to-end verification is manual, against the real project.

## Known limits at first delivery

Resend has no verified domain on this account, so every email to an address
other than the account owner's returns 403. Until a domain is verified the
digest's email half cannot be observed; the push half is unaffected. The code
ships complete and the email begins working the moment the domain is verified —
no further change.

Push also requires a registered device. An account that never installed the PWA
and granted permission has no subscription, and its digest push logs
`no_devices`.

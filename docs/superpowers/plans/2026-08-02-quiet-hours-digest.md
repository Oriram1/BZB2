# Quiet-Hours Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hold chat notifications back overnight and deliver one morning summary — a push saying how many arrived and an email listing who sent them, with a link per conversation.

**Architecture:** Three defects are fixed in the existing dispatcher so quiet hours actually engage (they never have — `notification_settings` is empty and the check reads `undefined`). Then a new hourly edge function collects the notifications quiet hours held back and inserts a single `quiet_hours_digest` row into `notifications`. The existing dispatcher sends it. No new sending code is written anywhere in this feature.

**Tech Stack:** Supabase (Postgres 15, pg_cron, pg_net), Deno edge functions, Resend, Web Push, vitest for the pure helpers.

## Global Constraints

- All user-facing copy is Hebrew. The app is RTL.
- Time zone for every hour calculation is `Asia/Jerusalem`, spelled exactly that way.
- Quiet-hours defaults when no settings row exists: enabled, start `22`, end `7`.
- Quiet hours withhold **email** for `message_received` only. Every other event type keeps today's behaviour (push withheld, email sent). `family_link_code` expires in ten minutes and must never be deferred.
- Edge functions authenticate with the `x-notify-secret` header against `NOTIFY_DISPATCH_SECRET`. Never add a second auth scheme.
- Deno imports require explicit file extensions (`./quietHours.ts`). Modules under `supabase/functions/_shared/` that vitest imports must contain **no** remote (`https://`) imports and no `Deno.*` references.
- Every new file gets a header comment explaining *why* it exists, matching the voice of the existing modules.
- Migration filenames use the `YYYYMMDDHHMMSS_snake_case_description.sql` form already in `supabase/migrations/`.
- Deep link for a single conversation is `/chat?conversation=<uuid>` — `src/pages/Chat.tsx:52` already reads that parameter. Do not invent a new route.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/functions/_shared/quietHours.ts` (new) | Pure quiet-window arithmetic and digest grouping. No I/O, no Deno globals — this is the only part vitest can reach. |
| `src/test/quietHours.test.ts` (new) | vitest coverage for the above. Lives under `src/` because `vitest.config.ts:11` only includes `src/**`. |
| `supabase/functions/_shared/email.ts` (modify) | Add an optional per-card URL to `EmailCard`. |
| `supabase/functions/_shared/notificationCopy.ts` (modify) | Email and push copy for the new event. |
| `src/lib/notificationCopy.ts` (modify) | Bell copy and channel defaults for the new event (mirror). |
| `src/integrations/supabase/types.ts` (modify) | Generated enum union — add the new value so the client compiles. |
| `supabase/functions/notify-dispatch/index.ts` (modify) | Quiet-hours defaults, chat email suppression, single delivery reason. |
| `supabase/functions/send-quiet-digest/index.ts` (new) | Hourly collector. Reads held notifications, writes one digest row. |
| `supabase/migrations/20260802120000_quiet_hours_digest_event.sql` (new) | `ALTER TYPE ... ADD VALUE`, alone in its own migration. |
| `supabase/migrations/20260802120100_quiet_digest_cron.sql` (new) | The runner function and the hourly cron entry. |

The enum change is deliberately isolated in its own migration file. Postgres forbids using a newly added enum value in the same transaction that adds it, and keeping it alone removes any chance of tripping that rule as the file grows.

---

## Task 1: Pure quiet-hours and grouping helpers

**Files:**
- Create: `supabase/functions/_shared/quietHours.ts`
- Test: `src/test/quietHours.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `QUIET_DEFAULTS: { enabled: boolean; start: number; end: number }`
  - `resolveQuietHours(settings: QuietSettings | null): { enabled: boolean; start: number; end: number }`
  - `inQuietWindow(hour: number, start: number, end: number): boolean`
  - `israelHour(now: Date): number`
  - `israelDate(now: Date): string` — `YYYY-MM-DD`
  - `quietWindowStart(now: Date, start: number, end: number): Date` — the UTC instant the just-ended quiet window began
  - `buildDigestCards(rows: HeldNotification[], siteBase: string): DigestCard[]`
  - `type QuietSettings = { quiet_hours_enabled: boolean | null; quiet_hours_start: number | null; quiet_hours_end: number | null }`
  - `type HeldNotification = { conversation_id: string; sender_name: string }`
  - `type DigestCard = { title: string; lines: string[]; url: string }`

- [ ] **Step 1: Write the failing test**

Create `src/test/quietHours.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  QUIET_DEFAULTS,
  buildDigestCards,
  inQuietWindow,
  israelDate,
  israelHour,
  quietWindowStart,
  resolveQuietHours,
} from "../../supabase/functions/_shared/quietHours.ts";

describe("resolveQuietHours", () => {
  it("falls back to 22->7 enabled when the row is missing", () => {
    // notification_settings is sparse: a user who never opened the settings
    // screen has no row at all, and the column DEFAULTs never materialise.
    expect(resolveQuietHours(null)).toEqual({ enabled: true, start: 22, end: 7 });
    expect(QUIET_DEFAULTS).toEqual({ enabled: true, start: 22, end: 7 });
  });

  it("honours an explicit row, including a disabled one", () => {
    expect(
      resolveQuietHours({ quiet_hours_enabled: false, quiet_hours_start: 23, quiet_hours_end: 6 }),
    ).toEqual({ enabled: false, start: 23, end: 6 });
  });

  it("fills per-column nulls from the defaults", () => {
    expect(
      resolveQuietHours({ quiet_hours_enabled: true, quiet_hours_start: null, quiet_hours_end: null }),
    ).toEqual({ enabled: true, start: 22, end: 7 });
  });
});

describe("inQuietWindow", () => {
  it("wraps midnight for the 22->7 default", () => {
    expect(inQuietWindow(23, 22, 7)).toBe(true);
    expect(inQuietWindow(2, 22, 7)).toBe(true);
    expect(inQuietWindow(22, 22, 7)).toBe(true);
    expect(inQuietWindow(7, 22, 7)).toBe(false);
    expect(inQuietWindow(21, 22, 7)).toBe(false);
    // The night that prompted this feature: 21:54 is NOT quiet hours.
    expect(inQuietWindow(21, 22, 7)).toBe(false);
  });

  it("handles a window that does not wrap", () => {
    expect(inQuietWindow(14, 13, 16)).toBe(true);
    expect(inQuietWindow(16, 13, 16)).toBe(false);
    expect(inQuietWindow(9, 13, 16)).toBe(false);
  });
});

describe("israelHour and israelDate", () => {
  it("converts a UTC instant to the Israel wall clock", () => {
    // 2026-08-01T18:54Z is 21:54 in Israel (UTC+3 in summer).
    expect(israelHour(new Date("2026-08-01T18:54:00Z"))).toBe(21);
    expect(israelDate(new Date("2026-08-01T18:54:00Z"))).toBe("2026-08-01");
    // Just past local midnight: the date must roll forward, the hour must not.
    expect(israelHour(new Date("2026-08-01T21:30:00Z"))).toBe(0);
    expect(israelDate(new Date("2026-08-01T21:30:00Z"))).toBe("2026-08-02");
  });
});

describe("quietWindowStart", () => {
  it("returns last night's 22:00 when the job runs at 07:00", () => {
    // 2026-08-02T04:00Z is 07:00 in Israel. The window began 22:00 the night
    // before, which is 2026-08-01T19:00Z.
    const start = quietWindowStart(new Date("2026-08-02T04:00:00Z"), 22, 7);
    expect(start.toISOString()).toBe("2026-08-01T19:00:00.000Z");
  });

  it("stays on the same day when the window does not wrap", () => {
    // 16:00 Israel = 13:00Z. Window 13->16 began 13:00 Israel = 10:00Z.
    const start = quietWindowStart(new Date("2026-08-02T13:00:00Z"), 13, 16);
    expect(start.toISOString()).toBe("2026-08-02T10:00:00.000Z");
  });
});

describe("buildDigestCards", () => {
  const base = "https://bzb-2.vercel.app";

  it("collapses repeats from one conversation into a single card", () => {
    const cards = buildDigestCards(
      [
        { conversation_id: "c1", sender_name: "יוסי" },
        { conversation_id: "c1", sender_name: "יוסי" },
        { conversation_id: "c1", sender_name: "יוסי" },
      ],
      base,
    );
    expect(cards).toEqual([
      { title: "יוסי", lines: ["3 הודעות"], url: `${base}/chat?conversation=c1` },
    ]);
  });

  it("uses the singular for exactly one message", () => {
    const cards = buildDigestCards([{ conversation_id: "c1", sender_name: "דנה" }], base);
    expect(cards[0].lines).toEqual(["הודעה אחת"]);
  });

  it("keeps conversations separate and orders by volume", () => {
    const cards = buildDigestCards(
      [
        { conversation_id: "c1", sender_name: "יוסי" },
        { conversation_id: "c2", sender_name: "דנה" },
        { conversation_id: "c2", sender_name: "דנה" },
      ],
      base,
    );
    expect(cards.map((card) => card.title)).toEqual(["דנה", "יוסי"]);
  });

  it("returns nothing for an empty collection", () => {
    expect(buildDigestCards([], base)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
npm test -- quietHours
```

Expected: FAIL — cannot resolve `../../supabase/functions/_shared/quietHours.ts`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/quietHours.ts`:

```ts
/**
 * Quiet-hours arithmetic, kept free of I/O on purpose.
 *
 * Everything here is a pure function so vitest can reach it from src/ — the
 * edge functions themselves import Deno and remote modules that the browser
 * test runner cannot load. Nothing in this file may import either.
 */

const TIME_ZONE = "Asia/Jerusalem";

export const QUIET_DEFAULTS = { enabled: true, start: 22, end: 7 } as const;

export type QuietSettings = {
  quiet_hours_enabled: boolean | null;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
};

export type HeldNotification = { conversation_id: string; sender_name: string };

export type DigestCard = { title: string; lines: string[]; url: string };

/**
 * `notification_settings` is sparse: a row appears only once someone changes a
 * setting, so the column DEFAULTs never apply to the majority of accounts. The
 * defaults have to live here instead, the same way CHANNEL_DEFAULTS covers the
 * equally sparse notification_preferences.
 */
export function resolveQuietHours(settings: QuietSettings | null) {
  return {
    enabled: settings?.quiet_hours_enabled ?? QUIET_DEFAULTS.enabled,
    start: settings?.quiet_hours_start ?? QUIET_DEFAULTS.start,
    end: settings?.quiet_hours_end ?? QUIET_DEFAULTS.end,
  };
}

/** The window usually wraps midnight (22 -> 7), so the test has two shapes. */
export function inQuietWindow(hour: number, start: number, end: number) {
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

function israelParts(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  // en-CA renders midnight as "24" rather than "00".
  const hour = Number(parts.hour) % 24;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour };
}

export function israelHour(now: Date) {
  return israelParts(now).hour;
}

export function israelDate(now: Date) {
  return israelParts(now).date;
}

/** Israel's UTC offset, as the "+03:00" suffix a Date constructor accepts. */
function israelOffset(now: Date) {
  const label =
    new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "longOffset" })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT+03:00";
  return label.replace("GMT", "") || "+03:00";
}

/**
 * The UTC instant at which the quiet window that just ended began. Called at
 * the end hour, so a wrapping window started yesterday and a non-wrapping one
 * started earlier today.
 */
export function quietWindowStart(now: Date, start: number, end: number) {
  const { date } = israelParts(now);
  const offset = israelOffset(now);
  const hh = String(start).padStart(2, "0");
  const sameDay = new Date(`${date}T${hh}:00:00${offset}`);
  if (start <= end) return sameDay;
  return new Date(sameDay.getTime() - 24 * 60 * 60 * 1000);
}

/**
 * One card per conversation, busiest first, so the email leads with whoever
 * actually needs a reply rather than whoever happened to message first.
 */
export function buildDigestCards(rows: HeldNotification[], siteBase: string): DigestCard[] {
  const byConversation = new Map<string, { sender: string; count: number }>();

  for (const row of rows) {
    const existing = byConversation.get(row.conversation_id);
    if (existing) {
      existing.count += 1;
    } else {
      byConversation.set(row.conversation_id, { sender: row.sender_name, count: 1 });
    }
  }

  return [...byConversation.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([conversationId, { sender, count }]) => ({
      title: sender,
      lines: [count === 1 ? "הודעה אחת" : `${count} הודעות`],
      url: `${siteBase}/chat?conversation=${conversationId}`,
    }));
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
npm test -- quietHours
```

Expected: PASS, 12 assertions across 5 describe blocks.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/quietHours.ts src/test/quietHours.test.ts
git commit -m "Extract quiet-hours arithmetic into a testable module"
```

---

## Task 2: Give email cards their own link

**Files:**
- Modify: `supabase/functions/_shared/email.ts:25` (the `EmailCard` type) and `:97-120` (`renderCards`), `:233-235` (the plain-text twin)

**Interfaces:**
- Consumes: nothing.
- Produces: `EmailCard` gains an optional `url?: string`.

The digest needs a link per conversation. Today a card carries a title and lines, and the template renders one action button for the whole message.

- [ ] **Step 1: Widen the type**

In `supabase/functions/_shared/email.ts`, replace the `EmailCard` declaration:

```ts
/** `url` turns the card title into a link — used by digests that summarise
 *  several separate things, each with its own destination. */
export type EmailCard = { title: string; lines: string[]; url?: string };
```

- [ ] **Step 2: Render the linked title**

In `renderCards`, replace the title `<div>` with a version that links when a URL is present. The surrounding `<table>`/`<td>` markup is unchanged:

```ts
            <div class="bzb-text" style="font-size:16px;font-weight:bold;color:${BRAND.text};padding-bottom:6px">${
              card.url
                ? `<a href="${escapeHtml(card.url)}" style="color:${BRAND.linkInk};text-decoration:underline">${escapeHtml(card.title)}</a>`
                : escapeHtml(card.title)
            }</div>
```

- [ ] **Step 3: Keep the plain-text twin honest**

In `renderEmail`, replace the card loop so the URL survives for clients that strip HTML:

```ts
  for (const card of content.cards ?? []) {
    textParts.push(card.title, ...card.lines.map((line) => `  ${line}`));
    if (card.url) textParts.push(`  ${card.url}`);
    textParts.push("");
  }
```

- [ ] **Step 4: Verify nothing else broke**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: the two pre-existing errors in `src/pages/Admin.tsx` and `src/pages/MyTasks.tsx` and nothing new. Those two are on `main` already; confirm with `git stash` if unsure.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/email.ts
git commit -m "Let an email card carry its own link"
```

---

## Task 3: Copy for the new event

**Files:**
- Modify: `supabase/functions/_shared/notificationCopy.ts` (type union, `emailContent`, `pushPayload`, `CHANNEL_DEFAULTS`)
- Modify: `src/lib/notificationCopy.ts` (type union, `notificationLine`, `CHANNEL_DEFAULTS`)
- Modify: `src/integrations/supabase/types.ts:655-662` and `:812-820`

**Interfaces:**
- Consumes: `EmailCard.url` from Task 2.
- Produces: the event name `quiet_hours_digest`, whose `data` is `{ date: string; total: number; cards: DigestCard[] }` and whose `link` is `/chat`.

`CHANNEL_DEFAULTS` is a `Record` over every event, so both copies fail to compile until the new key exists. That is the intended safety net — do not silence it with a partial type.

- [ ] **Step 1: Extend the edge-function copy**

In `supabase/functions/_shared/notificationCopy.ts`, add `| "quiet_hours_digest"` to `NotificationEvent`, then add this case to `emailContent`:

```ts
    case "quiet_hours_digest": {
      const total = Number(data.total) || 0;
      const headline = total === 1 ? "הודעה אחת חדשה" : `${total} הודעות חדשות`;
      const cards = Array.isArray(data.cards)
        ? (data.cards as { title: string; lines: string[]; url?: string }[])
        : [];
      return {
        subject: `${headline} שהגיעו בזמן השקט 🌙`,
        preheader: "סיכום ההודעות שהגיעו בזמן שהתראות היו מושתקות",
        heading: `בזמן השקט הגיעו ${headline}`,
        paragraphs: ["השתקנו את ההתראות בלילה כדי לא להעיר אותך. הנה מה שחיכה:"],
        cards,
        action: { label: "פתיחת הצ׳אט", url },
        manageUrl,
      };
    }
```

and this case to `pushPayload`:

```ts
    case "quiet_hours_digest": {
      const total = Number(data.total) || 0;
      return {
        title: total === 1 ? "הודעה אחת חדשה 🌙" : `היו ${total} הודעות חדשות 🌙`,
        body: "הגיעו בזמן שההתראות היו מושתקות",
        url,
        // One digest per morning, so the date alone keeps it collapsible.
        tag: `quiet-digest-${str(data.date)}`,
      };
    }
```

and this entry to `CHANNEL_DEFAULTS`:

```ts
  quiet_hours_digest: { email: true, push: true },
```

- [ ] **Step 2: Mirror it on the client**

In `src/lib/notificationCopy.ts`, add `| "quiet_hours_digest"` to `NotificationEvent`, add this case to `notificationLine`:

```ts
    case "quiet_hours_digest": {
      const total = Number(data.total) || 0;
      return {
        emoji: "🌙",
        title: total === 1 ? "הודעה אחת חדשה" : `${total} הודעות חדשות`,
        body: "הגיעו בזמן שההתראות היו מושתקות",
      };
    }
```

and the same `CHANNEL_DEFAULTS` entry:

```ts
  quiet_hours_digest: { email: true, push: true },
```

Leave `SETTINGS_ROWS` alone. The digest is a consequence of the chat toggle the user already controls; a second switch for the same decision would only let the two disagree.

- [ ] **Step 3: Extend the generated enum by hand**

In `src/integrations/supabase/types.ts`, add `| "quiet_hours_digest"` after `"family_link_code"` at line 662, and `"quiet_hours_digest",` after `"family_link_code",` at line 819. Regeneration will produce the same thing once the migration in Task 6 is applied.

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit -p tsconfig.app.json && npm test
```

Expected: only the two pre-existing errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/notificationCopy.ts src/lib/notificationCopy.ts src/integrations/supabase/types.ts
git commit -m "Add copy for the quiet-hours digest"
```

---

## Task 4: Fix the dispatcher

**Files:**
- Modify: `supabase/functions/notify-dispatch/index.ts` — delete the local `TIME_ZONE`/`hourInIsrael`/`inQuietHours` helpers (`:18`, `:31-42`), rework the email block (`:168-203`) and the push block (`:206-218`)

**Interfaces:**
- Consumes: `resolveQuietHours`, `inQuietWindow`, `israelHour` from Task 1.
- Produces: nothing new. Delivery rows now carry an accurate `error` value.

Three defects, all in this file:

1. `settings?.quiet_hours_enabled` is `undefined` for every account because the table is empty, so quiet hours have never once fired.
2. Quiet hours guard the push block only; email goes out regardless.
3. Line 176 logs `batched`, then line 202 upserts the same `(notification_id, channel)` with `disabled` and destroys it. Every email skip in the database currently reads `disabled` whatever the real cause.

- [ ] **Step 1: Swap the local helpers for the shared module**

Replace the `TIME_ZONE` constant and both helper functions with an import at the top of the file:

```ts
import { inQuietWindow, israelHour, resolveQuietHours } from "../_shared/quietHours.ts";
```

- [ ] **Step 2: Resolve quiet hours once, before either channel**

Immediately after the `settings` query, add:

```ts
  const quiet = resolveQuietHours(settings ?? null);
  const isQuiet = quiet.enabled && inQuietWindow(israelHour(new Date()), quiet.start, quiet.end);
```

- [ ] **Step 3: Decide the email reason once, then write it once**

Replace the whole email section (the `if (row.event_type === "message_received" ...)` block through the `else if (!emailEnabled ...)` block) with:

```ts
  // One variable, one write. The previous shape logged "batched" and then
  // immediately overwrote it with "disabled" via the same upsert key, which is
  // why every skipped email in the log claims the wrong reason.
  let emailSkipReason: string | null = emailEnabled ? null : "disabled";

  if (!emailSkipReason && row.event_type === "message_received") {
    // Chat is the one event quiet hours withhold on both channels: it is never
    // urgent, and it is the only event this digest collects. Everything else
    // keeps its email, because family_link_code expires in ten minutes and a
    // code delivered at 07:00 is a dead code.
    if (isQuiet) {
      emailSkipReason = "quiet_hours";
    } else {
      const { allowed, unreadCount } = await chatEmailAllowed(admin, row, userId);
      row.data.unread_count = unreadCount;
      if (!allowed) emailSkipReason = "batched";
    }
  }

  if (!alreadyHandled.has("email")) {
    if (emailSkipReason) {
      await logDelivery(admin, notificationId, userId, "email", "skipped", emailSkipReason);
    } else {
      const { data: userResult } = await admin.auth.admin.getUserById(userId);
      const address = userResult?.user?.email;
      if (!address) {
        await logDelivery(admin, notificationId, userId, "email", "skipped", "no_address");
      } else {
        try {
          await sendEmail({ to: address, content: emailContent(row), tag: row.event_type });
          await logDelivery(admin, notificationId, userId, "email", "sent");
        } catch (error) {
          await logDelivery(
            admin,
            notificationId,
            userId,
            "email",
            "failed",
            error instanceof Error ? error.message : "unknown",
          );
        }
      }
    }
  }
```

- [ ] **Step 4: Point the push block at the resolved value**

Replace the quiet-hours branch condition in the push section with `isQuiet`, and update the comment — the email is no longer guaranteed to have gone out:

```ts
    } else if (isQuiet) {
      // The notification is still in the bell. For chat this is what the
      // morning digest later collects; for everything else the email already
      // went out and only the buzz is withheld.
      await logDelivery(admin, notificationId, userId, "push", "skipped", "quiet_hours");
    } else {
```

- [ ] **Step 5: Check the whole function still parses under Deno**

```bash
npx supabase functions deploy notify-dispatch --project-ref nrqgoaxraywprlbyzrso
```

Expected: deploy succeeds. A syntax or import error fails here rather than silently at runtime.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/notify-dispatch/index.ts
git commit -m "Make quiet hours actually engage, and stop the log overwriting its own reason"
```

---

## Task 5: The collector

**Files:**
- Create: `supabase/functions/send-quiet-digest/index.ts`

**Interfaces:**
- Consumes: `buildDigestCards`, `israelDate`, `israelHour`, `inQuietWindow`, `quietWindowStart`, `resolveQuietHours` from Task 1; the `quiet_hours_digest` event from Task 3.
- Produces: an HTTP endpoint accepting `{}` (the hourly cron) or `{ user_id, force }` (manual test).

Modelled on `send-parent-digest`: the cron fires hourly and each run serves only the users whose hour matches, keeping per-user scheduling out of Postgres.

- [ ] **Step 1: Write the function**

```ts
/**
 * The morning after.
 *
 * Quiet hours withhold chat notifications overnight; this collects what was
 * withheld and posts a single summary once the window ends. pg_cron calls it
 * every hour and each run serves only the users whose quiet hours end at that
 * hour, which keeps per-user scheduling out of the database.
 *
 * Nothing was withheld → no notification. An empty digest is noise, and noise
 * is what makes people mute a channel.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { siteUrl } from "../_shared/email.ts";
import {
  buildDigestCards,
  inQuietWindow,
  israelDate,
  israelHour,
  quietWindowStart,
  resolveQuietHours,
  type HeldNotification,
} from "../_shared/quietHours.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Held-back chat notifications for one user: unread, inside the window that
 * just closed, and logged by the dispatcher as skipped for quiet hours.
 */
async function heldMessages(
  admin: SupabaseClient,
  userId: string,
  since: Date,
): Promise<HeldNotification[]> {
  const { data: notifications } = await admin
    .from("notifications")
    .select("id, data")
    .eq("user_id", userId)
    .eq("event_type", "message_received")
    .is("read_at", null)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true })
    .limit(200);

  if (!notifications?.length) return [];

  const { data: deliveries } = await admin
    .from("notification_deliveries")
    .select("notification_id")
    .eq("channel", "push")
    .eq("error", "quiet_hours")
    .in("notification_id", notifications.map((row) => row.id));

  const held = new Set((deliveries ?? []).map((row) => row.notification_id));

  return notifications
    .filter((row) => held.has(row.id))
    .map((row) => ({
      conversation_id: String((row.data ?? {}).conversation_id ?? ""),
      sender_name: String((row.data ?? {}).sender_name ?? "משתמש"),
    }))
    .filter((row) => row.conversation_id);
}

/** One digest per user per day, however many times the cron retries. */
async function alreadySent(admin: SupabaseClient, userId: string, date: string) {
  const { data } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("event_type", "quiet_hours_digest")
    .eq("data->>date", date)
    .limit(1);
  return (data ?? []).length > 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("NOTIFY_DISPATCH_SECRET");
  if (!expectedSecret || req.headers.get("x-notify-secret") !== expectedSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "server_not_configured" }, 500);

  const admin = createClient(supabaseUrl, serviceKey);
  const body = await req.json().catch(() => ({}));
  const onlyUser = body.user_id ? String(body.user_id) : null;
  const force = body.force === true;

  const now = new Date();
  const hour = israelHour(now);
  const date = israelDate(now);
  const base = siteUrl();

  // Candidates are everyone who was sent a held-back chat notification, which
  // is a far smaller set than every user and needs no separate roster.
  const { data: candidates } = await admin
    .from("notification_deliveries")
    .select("user_id")
    .eq("channel", "push")
    .eq("error", "quiet_hours")
    .gte("created_at", new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString());

  let userIds = [...new Set((candidates ?? []).map((row) => row.user_id as string))];
  if (onlyUser) userIds = userIds.filter((id) => id === onlyUser);
  if (!userIds.length) return json({ ok: true, hour, date, sent: 0 });

  const { data: settingsRows } = await admin
    .from("notification_settings")
    .select("user_id, quiet_hours_enabled, quiet_hours_start, quiet_hours_end")
    .in("user_id", userIds);

  const settingsByUser = new Map((settingsRows ?? []).map((row) => [row.user_id, row]));

  let sent = 0;
  for (const userId of userIds) {
    const quiet = resolveQuietHours(settingsByUser.get(userId) ?? null);
    if (!quiet.enabled) continue;
    // The digest is due exactly when the window ends. `force` is the manual
    // test hook — without it, verifying a change means waiting for 07:00.
    if (!force && hour !== quiet.end) continue;
    if (await alreadySent(admin, userId, date)) continue;

    const since = quietWindowStart(now, quiet.start, quiet.end);
    // A forced run mid-window would otherwise find nothing, because the window
    // it computes has not started yet.
    const from = force && inQuietWindow(hour, quiet.start, quiet.end)
      ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
      : since;

    const rows = await heldMessages(admin, userId, from);
    if (!rows.length) continue;

    const cards = buildDigestCards(rows, base);
    await admin.from("notifications").insert({
      user_id: userId,
      event_type: "quiet_hours_digest",
      data: { date, total: rows.length, cards },
      link: "/chat",
    });
    sent += 1;
  }

  return json({ ok: true, hour, date, sent });
});
```

- [ ] **Step 2: Deploy it**

```bash
npx supabase functions deploy send-quiet-digest --project-ref nrqgoaxraywprlbyzrso
```

Expected: deploy succeeds.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-quiet-digest/index.ts
git commit -m "Collect the night's held-back messages into one morning digest"
```

---

## Task 6: Migrations and wiring

**Files:**
- Create: `supabase/migrations/20260802120000_quiet_hours_digest_event.sql`
- Create: `supabase/migrations/20260802120100_quiet_digest_cron.sql`

**Interfaces:**
- Consumes: the `send-quiet-digest` endpoint from Task 5.
- Produces: the `quiet_hours_digest` enum value and the `quiet-digest-hourly` cron job.

- [ ] **Step 1: Add the enum value, alone**

`supabase/migrations/20260802120000_quiet_hours_digest_event.sql`:

```sql
-- The morning summary of everything quiet hours held back overnight.
--
-- Alone in its own migration on purpose: Postgres refuses to use a newly added
-- enum value in the transaction that added it, and keeping this by itself means
-- no later edit to a shared file can accidentally trip that rule.
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'quiet_hours_digest';
```

- [ ] **Step 2: Add the runner and the schedule**

`supabase/migrations/20260802120100_quiet_digest_cron.sql`:

```sql
-- Hourly trigger for the quiet-hours digest.
--
-- Same shape as run_parent_digest: fire every hour, and let the edge function
-- serve only the users whose quiet hours end at this hour. Per-user scheduling
-- never enters Postgres.

CREATE OR REPLACE FUNCTION public.run_quiet_digest()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  digest_url TEXT;
  dispatch_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO digest_url
    FROM vault.decrypted_secrets WHERE name = 'quiet_digest_url';
  SELECT decrypted_secret INTO dispatch_secret
    FROM vault.decrypted_secrets WHERE name = 'notify_dispatch_secret';

  -- No config yet: stay quiet rather than logging an error every hour.
  IF digest_url IS NULL OR dispatch_secret IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := digest_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', dispatch_secret
    ),
    timeout_milliseconds := 30000
  );
END;
$$;

-- Ten past the hour, clear of the parent digest at five past.
SELECT cron.schedule(
  'quiet-digest-hourly',
  '10 * * * *',
  $$SELECT public.run_quiet_digest()$$
);
```

- [ ] **Step 3: Push the migrations**

```bash
npx supabase db push --project-ref nrqgoaxraywprlbyzrso
```

Expected: both migrations apply.

- [ ] **Step 4: Register the endpoint in Vault**

The runner is a no-op until `quiet_digest_url` exists. In the Supabase dashboard, add a Vault secret named `quiet_digest_url` with the value `https://nrqgoaxraywprlbyzrso.supabase.co/functions/v1/send-quiet-digest`. Confirm it landed:

```bash
psql -X -c "select name from vault.decrypted_secrets order by name;"
```

Expected: `notify_dispatch_secret`, `notify_dispatch_url`, `parent_digest_url`, `quiet_digest_url`.

- [ ] **Step 5: Confirm the cron entry exists**

```bash
psql -X -c "select jobname, schedule, active from cron.job order by jobname;"
```

Expected: `parent-digest-hourly` and `quiet-digest-hourly`, both active.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260802120000_quiet_hours_digest_event.sql supabase/migrations/20260802120100_quiet_digest_cron.sql
git commit -m "Schedule the quiet-hours digest"
```

---

## Task 7: End-to-end verification

**Files:** none — this task changes nothing and produces evidence.

Connect with the credentials already in `.env.supabase.local`:

```bash
set -a && . ./.env.supabase.local && set +a
export PGPASSWORD="$SUPABASE_DB_PASSWORD" PGHOST=aws-0-eu-central-1.pooler.supabase.com \
  PGPORT=5432 PGUSER="postgres.$SUPABASE_PROJECT_REF" PGDATABASE=postgres
```

- [ ] **Step 1: Confirm a device is registered**

```bash
psql -X -c "select left(user_id::text,8) usr, count(*) from push_subscriptions group by 1;"
```

Both test accounts must appear. An account with no row will log `no_devices` and prove nothing — install the PWA and grant permission first.

- [ ] **Step 2: Send a message after 22:00 Israel time, then check it was held**

```bash
psql -X -c "select n.created_at at time zone 'Asia/Jerusalem' t, d.channel, d.status, d.error
from notifications n join notification_deliveries d on d.notification_id = n.id
where n.event_type = 'message_received' and n.created_at > now() - interval '2 hours'
order by t desc, d.channel;"
```

Expected: both `push` and `email` rows reading `skipped / quiet_hours`. Before this change the push row said `no_devices` or `sent` and the email row said `disabled`.

- [ ] **Step 3: Force the digest without waiting for morning**

```bash
curl -s -X POST "https://nrqgoaxraywprlbyzrso.supabase.co/functions/v1/send-quiet-digest" \
  -H "Content-Type: application/json" \
  -H "x-notify-secret: $NOTIFY_DISPATCH_SECRET" \
  -d '{"user_id":"<recipient-uuid>","force":true}'
```

Expected: `{"ok":true,...,"sent":1}` and a push arriving on the device reading `היו N הודעות חדשות 🌙`.

- [ ] **Step 4: Confirm what the digest actually did**

```bash
psql -X -c "select n.created_at at time zone 'Asia/Jerusalem' t, n.data->>'total' total,
jsonb_array_length(n.data->'cards') cards, d.channel, d.status, left(coalesce(d.error,'-'),40) err
from notifications n left join notification_deliveries d on d.notification_id = n.id
where n.event_type = 'quiet_hours_digest' order by t desc limit 10;"
```

Expected: one row, `total` matching the messages sent, `push` `sent`.

The `email` row will read `failed` with a 403 from Resend. That is expected and is not a defect in this feature: the account has no verified domain, so Resend refuses every recipient except the account owner's own address. The email half begins working the moment a domain is verified, with no further code change.

- [ ] **Step 5: Confirm the run is idempotent**

Re-run the same curl from Step 3.

Expected: `"sent":0`, and no second push. The guard is `alreadySent`, keyed on `data->>date`.

- [ ] **Step 6: Confirm a quiet message before 22:00 is unaffected**

Send a message at, say, 21:50 and re-run the query from Step 2.

Expected: `push` `sent` and `email` either `sent` or `skipped / batched` — never `quiet_hours`. This is the case that started the investigation: 21:54 is not quiet hours, and the old code's `disabled` label hid that.

---

## Self-Review

**Spec coverage.** Part A1 (defaults for the missing settings row) is Task 1 plus Task 4 Step 2. A2 (email suppression, chat only) is Task 4 Step 3. A3 (log one reason once) is Task 4 Step 3. Part B (the digest) is Tasks 3, 5 and 6, with the per-card link requirement met by Task 2. The testing hook is in Task 5 Step 1 and exercised in Task 7 Step 3. The spec's vitest coverage list — wrapping windows, non-wrapping windows, empty collections, multiple conversations — is Task 1 Step 1. The two known limits (Resend, `no_devices`) are verification steps 1 and 4 rather than code.

**Type consistency.** `HeldNotification` and `DigestCard` are declared once in Task 1 and imported by name in Task 5. The digest payload is `{ date, total, cards }` in Task 5's insert and read back with exactly those keys in Task 3's copy. `EmailCard.url` is optional in Task 2 and `DigestCard.url` is required in Task 1, so every card the digest builds satisfies the email type.

**One gap found and closed.** An earlier draft forced runs to use `quietWindowStart`, which returns a window that has not begun when the function is invoked mid-evening — a forced test at 22:30 would have found nothing and looked broken. Task 5 Step 1 now widens the lookback to 24 hours when `force` is used inside the window.

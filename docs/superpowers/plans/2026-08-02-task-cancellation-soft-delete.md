# Task Cancellation & Soft-Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let taskers cancel or archive published tasks from MyTasks with swipe-right on mobile, notify affected applicants, and replace all hard-deletes site-wide with soft-delete into an archive table.

**Architecture:** New `archived_records` table stores soft-deleted rows as JSONB. Task cancellation sets status to `cancelled` and fires `task_cancelled` notifications to accepted applicants via the existing notify-dispatch pipeline. Swipe gesture uses touch events on task cards with an RTL confirmation dialog.

**Tech Stack:** React (touch events), Supabase (migration, edge function update), existing notification pipeline (pg_net trigger -> notify-dispatch).

## Global Constraints

- RTL (dir="rtl") everywhere, Hebrew copy
- Heebo font only
- Existing notification pattern: insert into `notifications` -> pg_net trigger -> `notify-dispatch` edge function
- `task_status` enum already has `cancelled`
- No hard deletes anywhere — archive instead

---

### Task 1: DB Migration — archived_records table + task_cancelled event

**Files:**
- Create: `supabase/migrations/20260802140000_archived_records_and_task_cancelled.sql`

**Interfaces:**
- Produces: `archived_records` table, `task_cancelled` notification_event enum value, `archive_record()` helper function

- [ ] **Step 1: Write migration**

```sql
-- Soft-delete archive: every "deletion" in the app writes the full row here
-- instead of removing it from the source table.
CREATE TABLE public.archived_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  record_data JSONB NOT NULL,
  archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX archived_records_table_record ON public.archived_records (table_name, record_id);

ALTER TABLE public.archived_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only service role inserts archives"
  ON public.archived_records FOR ALL USING (false);

-- Add task_cancelled to notification events
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'task_cancelled';

-- Helper: archive a row and delete the original in one call.
CREATE OR REPLACE FUNCTION public.archive_record(
  _table TEXT,
  _record_id TEXT,
  _record_data JSONB,
  _user_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.archived_records (table_name, record_id, record_data, archived_by)
  VALUES (_table, _record_id, _record_data, _user_id);
$$;
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db push` (or apply via Supabase dashboard SQL editor)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260802140000_archived_records_and_task_cancelled.sql
git commit -m "feat: add archived_records table and task_cancelled event"
```

---

### Task 2: Notification copy for task_cancelled

**Files:**
- Modify: `supabase/functions/_shared/notificationCopy.ts`
- Modify: `src/lib/notificationCopy.ts`

**Interfaces:**
- Consumes: `task_cancelled` enum value from Task 1
- Produces: `emailContent`, `pushPayload`, `notificationLine`, `CHANNEL_DEFAULTS`, `SETTINGS_ROWS` entries for `task_cancelled`

- [ ] **Step 1: Add task_cancelled to edge-function notificationCopy.ts**

In `supabase/functions/_shared/notificationCopy.ts`:

Add `"task_cancelled"` to the `NotificationEvent` union type.

Add to `emailContent` switch:
```typescript
case "task_cancelled": {
  const task = str(data.task_name, "המטלה");
  const canceller = str(data.canceller_name, "מפרסם המטלה");
  return {
    subject: `המטלה "${task}" בוטלה`,
    preheader: `${canceller} ביטל/ה את המטלה`,
    heading: "המטלה בוטלה",
    paragraphs: [
      `${canceller} ביטל/ה את המטלה "${task}".`,
      "אפשר לחפש מטלות חדשות בכל עת.",
    ],
    action: { label: "למטלות פתוחות", url: `${base}/tasks` },
    manageUrl,
  };
}
```

Add to `pushPayload` switch:
```typescript
case "task_cancelled":
  return {
    title: "המטלה בוטלה ❌",
    body: `"${str(data.task_name, "המטלה")}" בוטלה על ידי ${str(data.canceller_name, "המפרסם")}`,
    url,
    tag: `cancelled-${str(data.task_id)}`,
  };
```

Add to `CHANNEL_DEFAULTS`:
```typescript
task_cancelled: { email: true, push: true },
```

- [ ] **Step 2: Add task_cancelled to client-side notificationCopy.ts**

In `src/lib/notificationCopy.ts`:

Add `"task_cancelled"` to `NotificationEvent` union.

Add to `notificationLine` switch:
```typescript
case "task_cancelled":
  return {
    emoji: "❌",
    title: "מטלה בוטלה",
    body: `"${text(data.task_name, "המטלה")}" בוטלה על ידי ${text(data.canceller_name, "המפרסם")}`,
  };
```

Add to `CHANNEL_DEFAULTS`:
```typescript
task_cancelled: { email: true, push: true },
```

Add to `SETTINGS_ROWS`:
```typescript
{
  event: "task_cancelled",
  label: "מטלה שהתקבלתי אליה בוטלה",
  description: "כשבעל המטלה מבטל מטלה שכבר התקבלתם אליה",
  roles: ["bee"],
},
```

- [ ] **Step 3: Verify tsc passes**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/notificationCopy.ts src/lib/notificationCopy.ts
git commit -m "feat: add task_cancelled notification copy and settings row"
```

---

### Task 3: Cancel + archive logic in MyTasks with swipe gesture

**Files:**
- Modify: `src/pages/MyTasks.tsx`

**Interfaces:**
- Consumes: `archive_record()` RPC from Task 1, `task_cancelled` event from Task 2
- Produces: `cancelTask()`, `archiveTask()` functions, swipe gesture on published task cards, RTL confirmation dialog

- [ ] **Step 1: Add cancelTask function**

Replace `deleteTask` with two new functions. `cancelTask` sets status to `cancelled` and notifies accepted applicants:

```typescript
const cancelTask = async (task: PublishedTask) => {
  const { error } = await supabase
    .from("tasks")
    .update({ status: "cancelled" })
    .eq("id", task.id);
  if (error) {
    toast.error("לא הצלחנו לבטל את המטלה");
    return;
  }

  // Notify accepted applicants
  const { data: accepted } = await supabase
    .from("task_applications")
    .select("applicant_id")
    .eq("task_id", task.id)
    .eq("status", "accepted");

  const profile = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("user_id", user!.id)
    .single();

  const cancellerName = profile.data
    ? `${profile.data.first_name} ${profile.data.last_name}`.trim()
    : "מפרסם המטלה";

  for (const app of accepted?.data ?? []) {
    await supabase.from("notifications").insert({
      user_id: app.applicant_id,
      event_type: "task_cancelled",
      data: { task_name: task.name, task_id: task.id, canceller_name: cancellerName },
      link: "/tasks",
    });
  }

  setPublishedTasks((current) =>
    current.map((t) => (t.id === task.id ? { ...t, status: "cancelled" } : t))
  );
  toast.success("המטלה בוטלה");
};
```

- [ ] **Step 2: Add archiveTask function**

```typescript
const archiveTask = async (task: PublishedTask) => {
  // Fetch full record for archiving
  const { data: fullTask } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", task.id)
    .single();

  if (!fullTask) {
    toast.error("לא הצלחנו לאחזר את המטלה");
    return;
  }

  // Archive applications first
  const { data: apps } = await supabase
    .from("task_applications")
    .select("*")
    .eq("task_id", task.id);

  for (const app of apps ?? []) {
    await supabase.rpc("archive_record", {
      _table: "task_applications",
      _record_id: app.id,
      _record_data: app,
      _user_id: user!.id,
    });
  }

  // Archive the task
  await supabase.rpc("archive_record", {
    _table: "tasks",
    _record_id: task.id,
    _record_data: fullTask,
    _user_id: user!.id,
  });

  // Delete originals
  await supabase.from("task_applications").delete().eq("task_id", task.id);
  const { error } = await supabase.from("tasks").delete().eq("id", task.id);
  if (error) {
    toast.error("לא הצלחנו למחוק את המטלה");
    return;
  }

  setPublishedTasks((current) => current.filter((t) => t.id !== task.id));
  setApplications((current) => current.filter((a) => a.taskId !== task.id));
  toast.success("המטלה הועברה לארכיון");
};
```

- [ ] **Step 3: Add swipe state and touch handlers**

Add state for swipe tracking and the confirmation dialog:

```typescript
const [swipedTaskId, setSwipedTaskId] = useState<string | null>(null);
const [confirmTask, setConfirmTask] = useState<PublishedTask | null>(null);
const touchStartRef = useRef<{ x: number; y: number; id: string } | null>(null);
```

Touch handler functions on published task cards:

```typescript
const handleTouchStart = (e: React.TouchEvent, taskId: string) => {
  const touch = e.touches[0];
  touchStartRef.current = { x: touch.clientX, y: touch.clientY, id: taskId };
};

const handleTouchEnd = (e: React.TouchEvent, task: PublishedTask) => {
  if (!touchStartRef.current || touchStartRef.current.id !== task.id) return;
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartRef.current.x;
  const dy = Math.abs(touch.clientY - touchStartRef.current.y);
  // RTL: swipe "right" in visual terms is negative deltaX
  // But user said "swipe right" meaning finger moves right = positive dx
  if (dx > 80 && dy < 50) {
    setConfirmTask(task);
  }
  touchStartRef.current = null;
};
```

- [ ] **Step 4: Replace published task card markup**

Add touch handlers to each published task `<article>`:

```tsx
<article
  key={task.id}
  className="rounded-3xl border border-border bg-card p-5 shadow-sm touch-pan-y"
  onTouchStart={(e) => handleTouchStart(e, task.id)}
  onTouchEnd={(e) => handleTouchEnd(e, task)}
>
```

Replace the old AlertDialog delete button with two buttons — cancel and archive:

```tsx
<div className="flex items-center gap-2">
  <Link to={`/task/${task.id}`}>
    <Button variant="outline" size="sm" className="rounded-full font-bold">לפרטי המטלה</Button>
  </Link>
  {task.status !== "cancelled" && (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setConfirmTask(task)}
      className="rounded-full text-destructive font-bold"
    >
      ביטול / מחיקה
    </Button>
  )}
</div>
```

- [ ] **Step 5: Add confirmation dialog**

After the Tabs component, add the RTL confirmation dialog:

```tsx
<AlertDialog open={!!confirmTask} onOpenChange={(open) => !open && setConfirmTask(null)}>
  <AlertDialogContent dir="rtl">
    <AlertDialogHeader>
      <AlertDialogTitle>מה לעשות עם "{confirmTask?.name}"?</AlertDialogTitle>
      <AlertDialogDescription>
        ביטול משנה את הסטטוס ומתריע למועמדים שהתקבלו. מחיקה מעבירה לארכיון ומסירה מהאתר.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
      <AlertDialogCancel className="rounded-full">חזרה</AlertDialogCancel>
      {confirmTask?.status !== "cancelled" && (
        <AlertDialogAction
          onClick={() => { if (confirmTask) cancelTask(confirmTask); setConfirmTask(null); }}
          className="rounded-full bg-amber-600 text-white hover:bg-amber-700"
        >
          ביטול המטלה
        </AlertDialogAction>
      )}
      <AlertDialogAction
        onClick={() => { if (confirmTask) archiveTask(confirmTask); setConfirmTask(null); }}
        className="rounded-full bg-destructive text-destructive-foreground"
      >
        מחיקה (ארכיון)
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 6: Remove old deleteTask function and its AlertDialog**

Delete the `deleteTask` function and the inline `<AlertDialog>` wrapping the trash icon in the published tasks tab. The new confirmation dialog replaces both.

- [ ] **Step 7: Add useRef import**

Make sure `useRef` is imported at the top of the file (add to existing import from "react").

- [ ] **Step 8: Verify build**

Run: `npx tsc --noEmit && npx vite build`

- [ ] **Step 9: Commit**

```bash
git add src/pages/MyTasks.tsx
git commit -m "feat: add task cancel/archive with swipe and notification"
```

---

### Task 4: Privacy policy — data archiving section

**Files:**
- Modify: `src/pages/PrivacyPolicy.tsx`

**Interfaces:**
- None

- [ ] **Step 1: Add data retention section**

After section 5 ("זכויות המשתמש ואבטחת מידע"), add:

```tsx
<h2 className="text-xl font-bold text-foreground mt-8">6. שמירת מידע וארכיון</h2>
<p>
  כאשר משתמש מוחק תוכן באפליקציה (מטלות, מועמדויות וכד'), המידע אינו נמחק באופן מיידי מהמערכת אלא מועבר לארכיון פנימי. מידע זה אינו מוצג באפליקציה ואינו נגיש למשתמשים, אך נשמר בשרתי החברה לצורך עמידה בדרישות חוקיות, פתרון סכסוכים ואכיפת תנאי השימוש. תוכל/י לבקש מחיקה מוחלטת של המידע שלך מהארכיון בכל עת באמצעות פנייה לשירות הלקוחות.
</p>
```

- [ ] **Step 2: Update the "last updated" date**

Change: `עדכון אחרון: מרץ 2026` → `עדכון אחרון: אוגוסט 2026`

- [ ] **Step 3: Commit**

```bash
git add src/pages/PrivacyPolicy.tsx
git commit -m "docs: add data archiving section to privacy policy"
```

---

### Task 5: Documentation

**Files:**
- Create: `docs/superpowers/sessions/2026-08-02-task-cancellation-session.md`

**Interfaces:**
- None

- [ ] **Step 1: Write feature doc**

Document: what was built, which files changed, DB changes, how the notification flows, how swipe works, the archive pattern.

- [ ] **Step 2: Commit and push everything**

```bash
git add docs/
git commit -m "docs: document the task cancellation feature"
git push origin main
```

---

### Task 6: Deploy Supabase functions

- [ ] **Step 1: Deploy notify-dispatch**

Run: `npx supabase functions deploy notify-dispatch`

- [ ] **Step 2: Apply migration**

Run migration via Supabase dashboard SQL editor or `npx supabase db push`

- [ ] **Step 3: Verify**

Check that `archived_records` table exists and `task_cancelled` is in the notification_event enum.

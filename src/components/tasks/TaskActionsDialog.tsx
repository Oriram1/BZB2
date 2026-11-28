import { useEffect, useState } from "react";
import { Check, Copy, PauseCircle, Pencil, PlayCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type TaskAction = "edit" | "pause" | "duplicate" | "delete";

export default function TaskActionsDialog({ open, onOpenChange, onAction, paused, pauseAvailable, pauseUnavailableMessage = "האפשרות עדיין לא זמינה", resumeWillPublish = true, editable = true, busy = false }: {
  open: boolean; onOpenChange: (open: boolean) => void; onAction: (action: TaskAction) => void;
  paused: boolean; pauseAvailable: boolean; pauseUnavailableMessage?: string; resumeWillPublish?: boolean; editable?: boolean; busy?: boolean;
}) {
  const [selected, setSelected] = useState<TaskAction | null>(null);
  useEffect(() => { if (!open) setSelected(null); }, [open]);
  const options = [
    { value: "edit" as const, label: "עריכת המטלה", Icon: Pencil, disabled: !editable },
    { value: "pause" as const, label: paused ? (resumeWillPublish ? "חידוש הפרסום" : "ביטול ההשהיה") : "השהיית הפרסום", Icon: paused ? PlayCircle : PauseCircle, disabled: !pauseAvailable || !editable },
    { value: "duplicate" as const, label: "שכפול מטלה", Icon: Copy, disabled: false },
    { value: "delete" as const, label: "מחיקת המטלה", Icon: Trash2, disabled: false },
  ];
  const enabled = options.filter((option) => !option.disabled);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="figma w-[calc(100%-2rem)] max-w-[358px] gap-0 rounded-[10px] bg-card p-[14px] max-sm:bottom-auto max-sm:top-1/2 max-sm:w-[calc(100%-2rem)] max-sm:max-w-[358px] max-sm:-translate-y-1/2 max-sm:rounded-[10px] max-sm:pb-[14px] [&>span[aria-hidden=true]]:hidden">
        <DialogTitle className="text-start text-lg font-semibold">פעולות למטלה</DialogTitle>
        <DialogDescription className="sr-only">בחרו פעולה ואשרו כדי להמשיך.</DialogDescription>
        <div role="radiogroup" aria-label="פעולות למטלה" className="mt-6">
          {options.map(({ value, label, Icon, disabled }) => (
            <button key={value} data-action={value} type="button" role="radio" aria-checked={selected === value}
              disabled={disabled || busy} onClick={() => setSelected(value)} onKeyDown={(event) => {
                if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(event.key)) return;
                event.preventDefault();
                const index = enabled.findIndex((option) => option.value === value);
                const direction = event.key === "ArrowDown" || event.key === "ArrowLeft" ? 1 : -1;
                const next = enabled[(index + direction + enabled.length) % enabled.length];
                setSelected(next.value);
                (event.currentTarget.parentElement?.querySelector(`[data-action="${next.value}"]`) as HTMLButtonElement | null)?.focus();
              }}
              className={cn("flex min-h-14 w-full items-center gap-3 border-b border-border px-3 text-start text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", value === "delete" && "mt-2 rounded-lg border-0 bg-destructive/10 text-destructive", selected === value && "bg-primary-soft ring-1 ring-primary") }>
              <Icon size={20} aria-hidden="true" /><span className="flex-1">{label}</span>
            </button>
          ))}
        </div>
        {!pauseAvailable && <p className="mt-2 text-xs text-muted-foreground">{pauseUnavailableMessage}</p>}
        <Button type="button" disabled={!selected || busy} className="mt-6 h-12 w-full gap-2 rounded-full" onClick={() => { if (selected) onAction(selected); }}>
          <Check size={18} aria-hidden="true" /> אישור
        </Button>
      </DialogContent>
    </Dialog>
  );
}

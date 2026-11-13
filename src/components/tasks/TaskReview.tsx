import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUp, Banknote, Calendar, Check, Clock, FileText, Hourglass, Image as ImageIcon, Loader2, MapPin,
  Pencil, Plus, ShieldCheck, Sparkles, StickyNote, Timer, Users, X, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import CategoryIcon from "@/components/tasks/CategoryIcon";
import { supabase } from "@/integrations/supabase/client";
import { categories, categoryLabel } from "@/lib/categories";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { AssistantFields } from "@/lib/taskForm";
import { assistantChanges, describeForm, fieldError, reviewLabels as labels, todayIso, type ReviewField, type ReviewForm } from "@/lib/taskForm";
import { SHORT_DESC_MAX } from "@shared/taskLimits.ts";import { toast } from "sonner";

type Editor = "text" | "textarea" | "number" | "date" | "time" | "category" | "paymentType";

interface RowProps {
  icon: LucideIcon;
  field: ReviewField;
  display: ReactNode;
  editor: Editor;
  form: ReviewForm;
  highlighted: boolean;
  onSave: (field: ReviewField, value: string) => void;
  /** Extra field edited in the same row (payment edits its type too). */
  companion?: ReviewField;
  /** Opens already editing — an optional field the person just asked to add. */
  startEditing?: boolean;
}

/** One line of the review. Tap to edit in place; Enter saves, Escape cancels. */
function Row({ icon: Icon, field, display, editor, form, highlighted, onSave, companion, startEditing = false }: RowProps) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(form[field]);
  const [companionDraft, setCompanionDraft] = useState(companion ? form[companion] : "");
  const error = editing ? fieldError(field, draft) : null;
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) fieldRef.current?.focus(); }, [editing]);
  const label = labels[field] ?? field;

  const open = () => { setDraft(form[field]); if (companion) setCompanionDraft(form[companion]); setEditing(true); };
  const save = () => {
    if (fieldError(field, draft)) return;
    onSave(field, draft.trim());
    if (companion) onSave(companion, companionDraft);
    setEditing(false);
  };
  const keys = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") setEditing(false);
    if (event.key === "Enter" && editor !== "textarea" && !event.nativeEvent.isComposing) { event.preventDefault(); save(); }
  };
  const inputId = `review-${field}`;

  return (
    <div className={`group flex items-start gap-3 rounded-2xl px-3 py-3 transition-colors ${highlighted ? "bg-primary/10" : "hover:bg-muted/50"}`}>
      <Icon size={18} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="block text-[11px] font-bold text-muted-foreground">{label}</label>
        {editing ? (
          <div className="mt-1.5 flex flex-col gap-2">
            {editor === "category" ? (
              <div id={inputId} role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
                {categories.map((category) => (
                  <button key={category.value} type="button" role="radio" aria-checked={draft === category.value}
                    onClick={() => setDraft(category.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold ${draft === category.value ? "border-primary bg-primary/15 text-primary-ink" : "border-border text-muted-foreground"}`}>
                    {category.label}
                  </button>
                ))}
              </div>
            ) : editor === "textarea" ? (
              <Textarea id={inputId} ref={fieldRef} dir="rtl" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={keys}
                className="min-h-[80px] rounded-xl text-base" />
            ) : (
              <div className="flex gap-2">
                <Input id={inputId} ref={fieldRef} onKeyDown={keys} value={draft}
                  dir={editor === "date" || editor === "time" ? "ltr" : "rtl"}
                  type={editor === "date" ? "date" : editor === "time" ? "time" : "text"}
                  inputMode={editor === "number" ? "numeric" : undefined}
                  min={editor === "date" ? todayIso() : undefined}
                  onChange={(e) => setDraft(editor === "number" ? e.target.value.replace(/[^0-9]/g, "") : e.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-xl text-base" />
                {companion === "paymentType" && (
                  <div role="radiogroup" aria-label="סוג תשלום" className="flex shrink-0 rounded-xl border border-border p-0.5">
                    {[["task", "למשימה"], ["hour", "לשעה"]].map(([value, text]) => (
                      <button key={value} type="button" role="radio" aria-checked={companionDraft === value}
                        onClick={() => setCompanionDraft(value)}
                        className={`rounded-lg px-2.5 text-xs font-bold ${companionDraft === value ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                        {text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {field === "shortDesc" && <p className="text-[11px] text-muted-foreground">{draft.trim().length}/{SHORT_DESC_MAX}</p>}
            {error && <p role="alert" className="text-xs font-bold text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" size="sm" className="h-8 gap-1 rounded-full gradient-honey text-primary-foreground" onClick={save} disabled={Boolean(error)}>
                <Check size={14} /> שמירה
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 rounded-full" onClick={() => setEditing(false)}>
                <X size={14} /> ביטול
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-0.5 break-words text-sm font-semibold text-foreground">{display}</div>
        )}
      </div>
      {!editing && (
        <button type="button" onClick={open} aria-label={`עריכת ${label}`}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary-ink hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Pencil size={15} />
        </button>
      )}
    </div>
  );
}

interface TaskReviewProps {
  form: ReviewForm;
  imagePreview: string | null;
  insurance: boolean;
  /** False while the admin has insurance switched off: no insurance shortcut. */
  insuranceOffered?: boolean;
  onChange: (changes: Partial<ReviewForm>) => void;
  /** Opens the extras step, where the image, notes and insurance live. */
  onOpenExtras: () => void;
}

export default function TaskReview({ form, imagePreview, insurance, insuranceOffered = true, onChange, onOpenExtras }: TaskReviewProps) {
  const [highlight, setHighlight] = useState<ReviewField[]>([]);
  const [request, setRequest] = useState("");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!highlight.length) return;
    const timer = window.setTimeout(() => setHighlight([]), 2_500);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  const save = (field: ReviewField, value: string) => {
    if (value === form[field]) return;
    onChange({ [field]: value });
    setHighlight([field]);
  };

  const askBusy = async () => {
    const text = request.trim();
    if (!text || asking) return;
    setAsking(true);
    const { data, error } = await supabase.functions.invoke("task-assistant", {
      body: { messages: [{ role: "user", text: `פרטי המטלה כרגע:\n${describeForm(form)}\n\nבקשת שינוי: ${text}`.slice(0, 1_000) }] },
    });
    setAsking(false);
    if (error || !data?.fields) {
      toast.error("לא הצלחנו לעדכן דרך ביזי. אפשר לערוך ידנית בעיפרון");
      return;
    }
    const changes = assistantChanges(data.fields as AssistantFields, form);
    const invalid = (Object.keys(changes) as ReviewField[]).filter((key) => fieldError(key, changes[key] ?? ""));
    invalid.forEach((key) => delete changes[key]);
    const changed = Object.keys(changes) as ReviewField[];
    if (!changed.length) {
      toast.info("לא מצאתי מה לשנות. נסו לנסח אחרת או לערוך בעיפרון");
      return;
    }
    onChange(changes);
    setHighlight(changed);
    setRequest("");
    toast.success(`עדכנתי: ${changed.map((key) => labels[key]).join(", ")}`);
  };

  const price = form.payment ? `${formatCurrency(Number(form.payment))} ${form.paymentType === "hour" ? "לשעה" : "למשימה"}` : "—";
  const workersText = form.workers === "1" ? "עובד אחד" : `${form.workers} עובדים`;
  const optional = [
    !form.fullDesc && { key: "fullDesc", label: "תיאור מפורט", icon: FileText },
    !form.duration && { key: "duration", label: "משך משוער", icon: Timer },
    !imagePreview && { key: "image", label: "תמונה", icon: ImageIcon },
    !form.notes && { key: "notes", label: "הערות", icon: StickyNote },
    insuranceOffered && !insurance && { key: "insurance", label: "ביטוח", icon: ShieldCheck },
  ].filter(Boolean) as { key: string; label: string; icon: LucideIcon }[];
  const [openOptional, setOpenOptional] = useState<ReviewField[]>([]);

  const rowProps = { form, onSave: save };
  const isHighlighted = (...fields: ReviewField[]) => fields.some((field) => highlight.includes(field));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-extrabold text-foreground text-start">רגע לפני פרסום 🚀</h2>
        <p className="mt-1 text-sm text-muted-foreground">ככה המטלה תיראה לדבורים. אפשר לתקן כל שורה בעיפרון.</p>
      </div>

      <article className="overflow-hidden rounded-3xl border border-primary/30 bg-card shadow-honey" aria-label="תצוגה מקדימה של המטלה">
        <div className="gradient-honey flex items-center justify-between gap-3 px-5 py-3 text-primary-foreground">
          <span className="inline-flex items-center gap-2 text-sm font-bold">
            <CategoryIcon category={form.category} size={18} /> {categoryLabel(form.category)}
          </span>
          <span className={`text-lg font-black tabular ${isHighlighted("payment", "paymentType") ? "animate-pulse" : ""}`}>{price}</span>
        </div>
        <div className="flex flex-col gap-3 p-5">
          <h3 className="text-xl font-extrabold leading-tight text-foreground">{form.taskName || "—"}</h3>
          <p className="text-sm text-muted-foreground">{form.shortDesc}</p>
          <div className="flex flex-wrap gap-2 text-xs font-bold text-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1.5"><Calendar size={13} /> {formatDateTime(form.date, form.time)}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1.5"><MapPin size={13} /> {form.location || "—"}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1.5"><Users size={13} /> {workersText}</span>
          </div>
          {imagePreview && <img src={imagePreview} alt="תמונה שצורפה" className="h-28 w-full rounded-2xl object-cover" />}
        </div>
      </article>

      <form className="rounded-3xl border border-border bg-primary/5 p-4" onSubmit={(event) => { event.preventDefault(); void askBusy(); }}>
        <label htmlFor="ask-busy" className="mb-2 flex items-center gap-1.5 text-sm font-bold text-foreground">
          <Sparkles size={16} className="text-primary-ink" aria-hidden /> רוצים לשנות משהו? תגידו לביזי
        </label>
        <div className="flex items-center gap-2">
          <Input id="ask-busy" dir="rtl" value={request} maxLength={300} disabled={asking}
            onChange={(event) => setRequest(event.target.value)}
            placeholder="למשל: תעלה ל-60 ש״ח ותזיז ל-10 בבוקר"
            className="h-11 min-w-0 flex-1 rounded-2xl bg-background text-base" />
          <Button type="submit" size="icon" aria-label="שליחה לביזי" disabled={asking || !request.trim()}
            className="h-11 w-11 shrink-0 rounded-full gradient-honey text-primary-foreground">
            {asking ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} />}
          </Button>
        </div>
      </form>

      <section className="rounded-3xl border border-border bg-card/60 p-2" aria-label="פרטי המטלה">
        <Row {...rowProps} icon={FileText} field="category" editor="category" highlighted={isHighlighted("category")} display={categoryLabel(form.category)} />
        <Row {...rowProps} icon={FileText} field="taskName" editor="text" highlighted={isHighlighted("taskName")} display={form.taskName} />
        <Row {...rowProps} icon={FileText} field="shortDesc" editor="textarea" highlighted={isHighlighted("shortDesc")} display={form.shortDesc} />
        <Row {...rowProps} icon={Banknote} field="payment" companion="paymentType" editor="number" highlighted={isHighlighted("payment", "paymentType")}
          display={<span className="font-black text-green-600 dark:text-green-400">{price}</span>} />
        <Row {...rowProps} icon={Users} field="workers" editor="number" highlighted={isHighlighted("workers")} display={workersText} />
        <Row {...rowProps} icon={MapPin} field="location" editor="text" highlighted={isHighlighted("location")} display={form.location} />
        <Row {...rowProps} icon={Calendar} field="date" editor="date" highlighted={isHighlighted("date")} display={form.date ? form.date.split("-").reverse().join(".") : "—"} />
        <Row {...rowProps} icon={Clock} field="time" editor="time" highlighted={isHighlighted("time")} display={<span dir="ltr">{form.time || "—"}</span>} />
        <Row {...rowProps} icon={Hourglass} field="expiry" editor="number" highlighted={isHighlighted("expiry")} display={`${form.expiry} ימים`} />
        {(form.fullDesc || openOptional.includes("fullDesc")) && (
          <Row {...rowProps} icon={FileText} field="fullDesc" startEditing={!form.fullDesc} editor="textarea" highlighted={isHighlighted("fullDesc")} display={form.fullDesc || "—"} />
        )}
        {(form.duration || openOptional.includes("duration")) && (
          <Row {...rowProps} icon={Timer} field="duration" startEditing={!form.duration} editor="number" highlighted={isHighlighted("duration")} display={form.duration ? `${form.duration} ימים` : "—"} />
        )}
        {(form.notes || openOptional.includes("notes")) && (
          <Row {...rowProps} icon={StickyNote} field="notes" startEditing={!form.notes} editor="textarea" highlighted={isHighlighted("notes")} display={form.notes || "—"} />
        )}
      </section>

      {/* What the assistant never asks about, so nothing is skipped silently. */}
      {optional.length > 0 && (
        <section aria-label="פרטים אופציונליים">
          <p className="mb-2 text-sm font-bold text-foreground">אפשר להוסיף (לא חובה)</p>
          <div className="flex flex-wrap gap-2">
            {optional.map(({ key, label, icon: Icon }) => (
              <Button key={key} type="button" variant="outline" size="sm" className="gap-1.5 rounded-full"
                onClick={() => (key === "image" || key === "insurance") ? onOpenExtras() : setOpenOptional((current) => [...current, key as ReviewField])}>
                <Plus size={14} /> <Icon size={14} aria-hidden /> {label}
              </Button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

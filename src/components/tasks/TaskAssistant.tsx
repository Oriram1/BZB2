import { useEffect, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { ArrowUp, ListChecks, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { categories } from "@/lib/categories";
import { toast } from "sonner";
import idleBee from "@/assets/assistant/bee-idle.webp";
import thinkingBee from "@/assets/assistant/bee-thinking.webp";
import "./TaskAssistantBee.css";

/** What the task-assistant function returns; null means "not said". */
export interface AssistantFields {
  category: string | null;
  taskName: string | null;
  shortDesc: string | null;
  fullDesc: string | null;
  payment: number | null;
  paymentType: "task" | "hour" | null;
  workers: number | null;
  location: string | null;
  date: string | null;
  time: string | null;
  duration: number | null;
}

export type MissingField = "category" | "taskName" | "shortDesc" | "payment" | "location" | "date" | "time";

interface Message { role: "user" | "assistant"; text: string; }

/** The server decides what is missing; asking about it is worded here, never by the model. */
const questionFor: Record<MissingField, string> = {
  category: "לאיזה תחום המטלה שייכת?",
  taskName: "מה בדיוק צריך לעשות?",
  shortDesc: "מה בדיוק צריך לעשות?",
  payment: "כמה תשלמו על זה? אפשר סכום כולל או לשעה.",
  location: "באיזו כתובת או עיר?",
  date: "באיזה תאריך?",
  time: "באיזו שעה?",
};

const GREETING = "שלום, אני ביזי 🐝 ספרו לי מה צריך לעשות, מתי, איפה וכמה תשלמו — ואני אמלא את הטופס.";
/** After this many answers with gaps left, the form is the faster way to finish. */
const MAX_TURNS = 4;
const MAX_CHARS = 1_000;

const askAbout = (missing: MissingField[]) =>
  [...new Set(missing.slice(0, 2).map((field) => questionFor[field]))].join(" ");

function quickReplies(field: MissingField | undefined): string[] {
  const today = new Date();
  if (field === "date") return [
    `היום (${format(today, "dd/MM")})`, `מחר (${format(addDays(today, 1), "dd/MM")})`, `בעוד שבוע (${format(addDays(today, 7), "dd/MM")})`,
  ];
  if (field === "time") return ["09:00", "14:00", "18:00"];
  if (field === "category") return categories.map((category) => category.label);
  return [];
}

interface TaskAssistantProps {
  /** An empty missing list means every required field is filled and the summary can open. */
  onApply: (fields: AssistantFields, missing: MissingField[]) => void;
  onManual: () => void;
}

export default function TaskAssistant({ onApply, onManual }: TaskAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ fields: AssistantFields; missing: MissingField[] } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const userTurns = messages.filter((message) => message.role === "user").length;

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: "nearest" }); }, [messages, loading]);

  const send = async (raw: string) => {
    const text = raw.trim().slice(0, MAX_CHARS);
    if (!text || loading) return;
    const next = [...messages, { role: "user" as const, text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("task-assistant", { body: { messages: next } });
    setLoading(false);

    if (error || !data?.fields || !Array.isArray(data.missing)) {
      const status = (error as { context?: Response } | null)?.context?.status;
      toast.error(status === 429 ? "הגעתם למגבלת השימוש בעוזר. אפשר להמשיך בטופס" : "העוזר לא זמין כרגע. אפשר למלא את הטופס ידנית");
      // Keep what they typed: the next attempt resends the whole conversation.
      setMessages(messages);
      setInput(text);
      return;
    }

    const found = { fields: data.fields as AssistantFields, missing: data.missing as MissingField[] };
    setResult(found);
    if (found.missing.length === 0) {
      onApply(found.fields, []);
      return;
    }
    if (next.filter((message) => message.role === "user").length >= MAX_TURNS) {
      toast.info("נשארו כמה פרטים — נשלים אותם בטופס");
      onApply(found.fields, found.missing);
      return;
    }
    setMessages([...next, { role: "assistant", text: askAbout(found.missing) }]);
  };

  const replies = !loading && result ? quickReplies(result.missing[0]) : [];

  return (
    <section className="flex flex-col gap-4" aria-label="עוזר פרסום מטלה">
      <div className="flex items-center gap-2">
        <Sparkles className="text-primary-ink" size={20} aria-hidden />
        <h2 className="text-xl font-extrabold text-foreground">ספרו לביזי מה צריך</h2>
      </div>

      <div className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto" role="log" aria-live="polite">
        <p className="max-w-[85%] self-start rounded-2xl rounded-ss-sm bg-primary/10 px-4 py-2.5 text-sm text-foreground">{GREETING}</p>
        {messages.map((message, index) => (
          <p key={index}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${message.role === "user"
              ? "self-end rounded-se-sm gradient-honey text-primary-foreground"
              : "self-start rounded-ss-sm bg-primary/10 text-foreground"}`}>
            {message.text}
          </p>
        ))}
        {loading && (
          <p className="inline-flex items-center gap-2 self-start rounded-2xl bg-primary/10 px-4 py-2.5 text-sm text-muted-foreground">
            <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden /> ממלא את הטופס…
          </p>
        )}
        <div ref={endRef} />
      </div>

      {replies.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="תשובות מהירות">
          {replies.map((reply) => (
            <Button key={reply} type="button" variant="outline" size="sm" className="rounded-full" onClick={() => void send(reply)}>
              <span dir="auto">{reply}</span>
            </Button>
          ))}
        </div>
      )}

      <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); void send(input); }}>
        <span className="relative block size-14 shrink-0 self-center sm:size-[72px]" aria-hidden="true">
          <span className="task-assistant-bee absolute inset-0" data-state="idle" data-active={!loading}
            style={{ backgroundImage: `url("${idleBee}")` }} />
          <span className="task-assistant-bee absolute inset-0" data-state="thinking" data-active={loading}
            style={{ backgroundImage: `url("${thinkingBee}")` }} />
        </span>
        <Textarea
          aria-label="תיאור המטלה"
          value={input}
          maxLength={MAX_CHARS}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send(input);
            }
          }}
          placeholder={userTurns === 0 ? "למשל: ניקוי חלונות מחר בערב ברמת גן, 50 ש״ח, עובד אחד" : "התשובה שלכם…"}
          className="min-h-[52px] flex-1 resize-none rounded-2xl text-base"
          rows={userTurns === 0 ? 3 : 1}
          disabled={loading}
        />
        <Button type="submit" size="icon" aria-label="שליחה" disabled={loading || !input.trim()}
          className="h-12 w-12 shrink-0 rounded-full gradient-honey text-primary-foreground">
          <ArrowUp size={20} />
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <Button type="button" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={onManual}>
          <ListChecks size={16} /> אמלא בעצמי
        </Button>
        {result && (
          <Button type="button" variant="outline" className="rounded-full" onClick={() => onApply(result.fields, result.missing)}>
            המשך לטופס עם מה שמולא
          </Button>
        )}
      </div>
    </section>
  );
}

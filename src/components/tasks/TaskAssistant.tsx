import { useEffect, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { ArrowUp, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { categories } from "@/lib/categories";
import { toast } from "sonner";
import idleBee from "@/assets/assistant/bee-idle.webp";
import thinkingBee from "@/assets/assistant/bee-thinking.webp";
import "./TaskAssistantBee.css";
import AssistantLocation, { type ConfirmedTaskLocation } from "./AssistantLocation";

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
  payment: "מה התקציב למטלה? אפשר לציין סכום כולל או מחיר לשעה.",
  location: "באיזו כתובת או עיר?",
  date: "באיזה תאריך?",
  time: "באיזו שעה?",
};

const GREETING = "ספרו לי בהרחבה מה צריך לעשות, איפה ומתי, ומה התקציב למטלה. אפשר לציין גם כמה עובדים צריך ולכמה זמן. אשאל על מה שחסר.";
const MAX_CHARS = 1_000;

const askAbout = (missing: MissingField[]) => questionFor[missing[0]];

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
  /** Opens review after all required fields and the meeting point are confirmed. */
  onApply: (fields: AssistantFields, missing: MissingField[], location?: ConfirmedTaskLocation) => void;
  onManual: () => void;
}

function Bee({ thinking = false }: { thinking?: boolean }) {
  return (
    <span className="relative block size-14 shrink-0" aria-hidden="true">
      <span className="task-assistant-bee absolute inset-0" data-state="idle" data-active={!thinking}
        style={{ backgroundImage: `url("${idleBee}")` }} />
      <span className="task-assistant-bee absolute inset-0" data-state="thinking" data-active={thinking}
        style={{ backgroundImage: `url("${thinkingBee}")` }} />
    </span>
  );
}

function BusyReply({ text, thinking = false }: { text: string; thinking?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Bee thinking={thinking} />
      <div className="min-w-0 pt-1">
        <span className="text-xs font-bold text-muted-foreground">ביזי</span>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-7 text-foreground">{text}</p>
      </div>
    </div>
  );
}

export default function TaskAssistant({ onApply, onManual }: TaskAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ fields: AssistantFields; missing: MissingField[] } | null>(null);
  const [confirmedLocation, setConfirmedLocation] = useState<ConfirmedTaskLocation | null>(null);
  const locationConfirmed = !!confirmedLocation && confirmedLocation.query === result?.fields.location;
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
      setMessages([...next, { role: "assistant", text: confirmedLocation?.query === found.fields.location ? "הטיוטה מוכנה. אפשר לבדוק את הפרטים לפני הפרסום." : "נשאר לאשר את נקודת המפגש במפה לפני בדיקת המטלה." }]);
      return;
    }
    setMessages([...next, { role: "assistant", text: askAbout(found.missing) }]);
  };

  const replies = !loading && result ? quickReplies(result.missing[0]) : [];

  return (
    <section className="flex flex-col gap-4" aria-label="עוזר פרסום מטלה">
      <div className="flex items-center gap-2">
        <svg className="text-primary-ink" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 3.5 11.5 5.5v4L8 11.5 4.5 9.5v-4z" />
          <path d="M16 12.5l3.5 2v4L16 20.5l-3.5-2v-4z" />
          <path d="M16 3.5l3.5 2v4L16 11.5" opacity=".45" />
          <path d="M8 12.5l3.5 2v4L8 20.5" opacity=".45" />
        </svg>
        <h2 className="text-xl font-extrabold text-foreground">ספרו לביזי מה צריך</h2>
      </div>

      <div className="flex max-h-[45vh] flex-col gap-5 overflow-y-auto overscroll-contain pe-1" role="log" aria-label="השיחה עם ביזי" aria-live="polite" aria-busy={loading}>
        <BusyReply text={GREETING} />
        {messages.map((message, index) => message.role === "assistant" ? (
          <BusyReply key={index} text={message.text} />
        ) : (
          <p key={index} dir="auto"
            className="max-w-[85%] self-end whitespace-pre-wrap break-words rounded-2xl rounded-ee-sm bg-primary/15 px-4 py-3 text-sm leading-7 text-foreground">
            {message.text}
          </p>
        ))}
        {loading && <BusyReply thinking text="ממלא את הטופס…" />}
        <div ref={endRef} />
      </div>

      {result?.fields.location && !locationConfirmed && !loading && (
        <AssistantLocation key={result.fields.location} query={result.fields.location} onConfirm={setConfirmedLocation} />
      )}

      {result && result.missing.length === 0 && locationConfirmed && (
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4" aria-label="טיוטת המטלה">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-foreground">טיוטת המטלה</h3>
            <span className="text-xs text-muted-foreground">מוכנה לבדיקה</span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {[
              ["המטלה", result.fields.taskName || result.fields.shortDesc],
              ["תחום", categories.find((category) => category.value === result.fields.category)?.label],
              ["מיקום", confirmedLocation?.formattedAddress],
              ["מועד", [result.fields.date, result.fields.time].filter(Boolean).join(" · ")],
              ["תשלום", result.fields.payment != null ? `${result.fields.payment} ₪${result.fields.paymentType === "hour" ? " לשעה" : ""}` : null],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="mb-1 text-xs text-muted-foreground">{label}</dt>
                <dd className="break-words font-medium text-foreground"><bdi>{value || "עוד לא צוין"}</bdi></dd>
              </div>
            ))}
          </dl>
          <Button type="button" disabled={loading} className="mt-4 w-full rounded-xl"
            onClick={() => onApply(result.fields, result.missing, confirmedLocation ?? undefined)}>
            בדיקת המטלה
          </Button>
        </div>
      )}

      {replies.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="תשובות מהירות">
          {replies.map((reply) => (
            <Button key={reply} type="button" variant="outline" size="sm" className="rounded-full" onClick={() => void send(reply)}>
              <span dir="auto">{reply}</span>
            </Button>
          ))}
        </div>
      )}

      <form className={`flex items-center gap-2 rounded-2xl border border-border bg-background p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${result?.fields.location && !locationConfirmed ? "" : "sticky bottom-0"}`}
        onSubmit={(event) => { event.preventDefault(); void send(input); }}>
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
          placeholder={userTurns === 0 ? "למשל: היי, צריך שניים שינקו לי את הדירה מחר בבוקר ברמת גן, בערך 3 שעות, 300 שקל" : "התשובה שלכם…"}
          className={`min-h-[48px] min-w-0 flex-1 py-3 resize-none placeholder:text-sm sm:placeholder:text-base ${userTurns === 0 ? "max-sm:min-h-[92px]" : ""} border-0 bg-transparent text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0`}
          rows={userTurns === 0 ? 2 : 1}
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

      </div>
    </section>
  );
}

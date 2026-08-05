import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Mic, Plus, Send, Smile, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface OutgoingMessage {
  text: string;
  /** Photo or voice note travelling with the message. */
  file?: File;
  kind?: "image" | "audio";
  /** Whole seconds, for the voice-note bubble. */
  duration?: number;
}

interface ChatComposerProps {
  onSend: (message: OutgoingMessage) => Promise<void>;
  disabled?: boolean;
}

/** A small, hand-picked set beats shipping a 200 KB emoji-picker dependency. */
const QUICK_EMOJI = [
  "🙂", "😀", "😅", "😍", "😘", "😉", "😎", "🤔",
  "🙏", "👍", "👌", "👏", "💪", "🔥", "✨", "🎉",
  "❤️", "💛", "🐝", "🍯", "☀️", "😢", "😡", "😴",
  "✅", "❌", "⏰", "📍", "💰", "🚗", "🏠", "📸",
];

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_TEXTAREA_PX = 120;

/** Safari does not record webm; Chrome and Firefox do not record mp4. */
const pickAudioMimeType = () => {
  // Safari/iOS can record and play AAC in an MP4 container, but generally
  // cannot play the WebM recordings preferred by Chromium. Check support at
  // runtime so Chromium still gets its native WebM/Opus path.
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? "";
};

const extensionFor = (mimeType: string) => {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
};

const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * The message box: attach a photo, drop in an emoji, type, or hold a voice note
 * — the same four affordances WhatsApp puts on one row.
 *
 * The mic turns into a send button as soon as there is something to send, so
 * the row never grows past its fixed height on a narrow phone.
 */
export function ChatComposer({ onSend, disabled = false }: ChatComposerProps) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [multiline, setMultiline] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** One-line height for the font actually in use — 16px on phones, 14px above md. */
  const singleLineRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);

  // Grow with the text, then scroll — a long message must not eat the screen.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const measured = el.scrollHeight;

    // A composer that is hidden (mobile shows the conversation list instead)
    // reports scrollHeight 0. Writing that back would leave a zero-height box
    // that never recovers when the chat is shown again, so hand the height back
    // to the CSS min-height until there is a real measurement to use.
    if (measured === 0) {
      el.style.height = "";
      return;
    }

    // The first real measurement is by definition one line of the current font,
    // which is what tells the row whether to centre on that line or hug the
    // bottom of a grown box. Measuring beats hard-coding a pixel height: the
    // font is 16px on phones (iOS zoom guard) and 14px from md up.
    if (singleLineRef.current === null) singleLineRef.current = measured;

    el.style.height = `${Math.min(measured, MAX_TEXTAREA_PX)}px`;
    setMultiline(measured > singleLineRef.current + 2);
  }, [text]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  // A preview URL and a live microphone both outlive React if we let them.
  useEffect(() => {
    return () => {
      if (image) URL.revokeObjectURL(image.previewUrl);
    };
  }, [image]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const pickImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset first: picking the same file twice must still fire a change event.
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("אפשר לצרף תמונות בלבד");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("התמונה גדולה מדי (עד 25MB)");
      return;
    }

    if (image) URL.revokeObjectURL(image.previewUrl);
    setImage({ file, previewUrl: URL.createObjectURL(file) });
  };

  const clearImage = () => {
    if (image) URL.revokeObjectURL(image.previewUrl);
    setImage(null);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("הדפדפן הזה לא תומך בהקלטה קולית");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      chunksRef.current = [];
      cancelledRef.current = false;
      const startedAt = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

        if (cancelledRef.current || chunksRef.current.length === 0) return;

        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const file = new File([blob], `voice.${extensionFor(type)}`, { type });
        void submit({ text: "", file, kind: "audio", duration: seconds });
      };

      recorder.start();
      recorderRef.current = recorder;
      setElapsed(0);
      setRecording(true);
    } catch {
      toast.error("אין גישה למיקרופון. אפשר לאשר אותה בהגדרות הדפדפן");
    }
  };

  const stopRecording = (cancel: boolean) => {
    cancelledRef.current = cancel;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (cancel) setElapsed(0);
  };

  const submit = async (message: OutgoingMessage) => {
    setSending(true);
    try {
      await onSend(message);
      setText("");
      clearImage();
    } catch {
      toast.error("ההודעה לא נשלחה. נסה שוב");
    } finally {
      setSending(false);
    }
  };

  const hasContent = text.trim().length > 0 || image !== null;

  const sendTyped = () => {
    if (!hasContent || sending || disabled) return;
    void submit({
      text: text.trim(),
      file: image?.file,
      kind: image ? "image" : undefined,
    });
  };

  const insertEmoji = (emoji: string) => {
    setText((value) => value + emoji);
    textareaRef.current?.focus();
  };

  if (recording) {
    return (
      <div className="shrink-0 border-t border-border bg-card px-2 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => stopRecording(true)}
            size="icon"
            variant="ghost"
            aria-label="ביטול ההקלטה"
            className="h-11 w-11 shrink-0 rounded-full text-destructive hover:bg-destructive/10"
          >
            <Trash2 size={20} />
          </Button>

          <div className="flex flex-1 items-center gap-2 rounded-full bg-muted px-4 py-2.5">
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-destructive" aria-hidden="true" />
            <span className="text-sm tabular-nums text-foreground" dir="ltr">
              {formatDuration(elapsed)}
            </span>
            <span className="truncate text-xs text-muted-foreground">מקליט הודעה קולית…</span>
          </div>

          <Button
            type="button"
            onClick={() => stopRecording(false)}
            size="icon"
            aria-label="שליחת ההקלטה"
            className="gradient-honey h-11 w-11 shrink-0 rounded-full border-none text-primary-foreground"
          >
            <Send size={18} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-border bg-card px-2 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      {image && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl bg-muted/60 p-2">
          <img
            src={image.previewUrl}
            alt="תצוגה מקדימה של התמונה"
            className="h-14 w-14 shrink-0 rounded-xl object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <ImageIcon size={14} aria-hidden="true" />
              תמונה מצורפת
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{image.file.name}</p>
          </div>
          <Button
            type="button"
            onClick={clearImage}
            size="icon"
            variant="ghost"
            aria-label="הסרת התמונה"
            className="h-9 w-9 shrink-0 rounded-full"
          >
            <X size={16} />
          </Button>
        </div>
      )}

      {/* In RTL flex order the first child is on the right: send/mic is kept
          first for the primary action, with attach on the left. */}
      <div className="flex items-end gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={pickImage}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />

        {/* One line: the emoji button sits on the text's own centre line. Once
            the box grows it hugs the bottom instead, next to the last line. */}
        <div
          className={cn(
            "flex min-w-0 flex-1 gap-1 rounded-3xl border border-border bg-background px-3 py-1",
            multiline ? "items-end" : "items-center",
          )}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends on a keyboard; Shift+Enter and the phone's own
              // return key keep adding lines.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendTyped();
              }
            }}
            rows={1}
            placeholder="הקלד הודעה..."
            disabled={disabled || sending}
            className="max-h-[120px] min-h-[2.25rem] flex-1 resize-none border-none bg-transparent py-2 text-sm leading-snug outline-none placeholder:text-muted-foreground disabled:opacity-60"
          />

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="הוספת אימוג׳י"
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground",
                  "transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  multiline && "mb-1",
                )}
              >
                <Smile size={20} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2" dir="rtl">
              <div className="grid grid-cols-8 gap-0.5">
                {QUICK_EMOJI.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => insertEmoji(emoji)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-colors hover:bg-muted"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <Button
          type="button"
          onClick={hasContent ? sendTyped : startRecording}
          disabled={disabled || sending}
          size="icon"
          aria-label={hasContent ? "שליחת הודעה" : "הקלטת הודעה קולית"}
          className={cn(
            "h-11 w-11 shrink-0 rounded-full border-none transition-transform",
            "gradient-honey text-primary-foreground hover:scale-105",
          )}
        >
          {sending ? (
            <Loader2 size={18} className="animate-spin" />
          ) : hasContent ? (
            <Send size={18} />
          ) : (
            <Mic size={20} />
          )}
        </Button>

        <Button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || sending}
          size="icon"
          variant="ghost"
          aria-label="צירוף תמונה"
          className="h-11 w-11 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        >
          <Plus size={22} />
        </Button>
      </div>
    </div>
  );
}

export default ChatComposer;

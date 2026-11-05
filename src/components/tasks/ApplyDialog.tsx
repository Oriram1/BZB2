import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const APPLICATION_MESSAGE_MAX = 300;

type ApplyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskName: string;
  /** Resolves true when the application was stored. */
  onSubmit: (message: string) => Promise<boolean>;
};

/**
 * Two screens in one dialog: a short confirmation with an optional note to the
 * publisher, then a "what happens next" screen. The note is what lets a
 * publisher tell a thoughtful applicant from a stray tap.
 */
const ApplyDialog = ({ open, onOpenChange, taskName, onSubmit }: ApplyDialogProps) => {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      // Let the closing animation finish before the form resets.
      setTimeout(() => { setSent(false); setMessage(""); }, 200);
    }
  };

  const submit = async () => {
    setSending(true);
    const ok = await onSubmit(message.trim());
    setSending(false);
    if (ok) setSent(true);
    else handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent dir="rtl" className="rounded-3xl sm:max-w-md">
        {sent ? (
          <div className="text-center space-y-4 py-2">
            <CheckCircle2 className="mx-auto h-14 w-14 text-primary-ink" aria-hidden="true" />
            <DialogHeader className="items-center sm:text-center">
              <DialogTitle className="text-xl font-extrabold">המועמדות נשלחה</DialogTitle>
              <DialogDescription className="sr-only">מה קורה עכשיו</DialogDescription>
            </DialogHeader>
            <ol className="text-sm text-start space-y-2 rounded-2xl bg-muted/60 p-4 list-decimal list-inside">
              <li>מפרסם המטלה מקבל התראה ובודק את המועמדות.</li>
              <li>אם תיבחרו, תקבלו התראה ואפשר יהיה לדבר בצ׳אט.</li>
              <li>את הסטטוס אפשר לראות בכל רגע בפעילות שלכם.</li>
            </ol>
            <div className="flex flex-col gap-2">
              <Button asChild className="h-12 rounded-2xl font-extrabold gradient-honey text-primary-foreground">
                <Link to="/my-tasks?tab=performing">לצפייה במועמדויות שלי</Link>
              </Button>
              <Button asChild variant="outline" className="h-12 rounded-2xl font-bold">
                <Link to="/tasks">חזרה למטלות</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader className="text-start">
              <DialogTitle className="text-xl font-extrabold">להגיש מועמדות?</DialogTitle>
              <DialogDescription>{taskName}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label htmlFor="application-message" className="text-sm font-bold">
                למה אתם מתאימים? <span className="font-medium text-muted-foreground">(לא חובה)</span>
              </label>
              <Textarea
                id="application-message"
                value={message}
                maxLength={APPLICATION_MESSAGE_MAX}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="למשל: יש לי ניסיון, אני גר קרוב, זמין בשעות האלה"
                rows={3}
              />
              <p className="text-xs text-muted-foreground tabular text-end">{message.length}/{APPLICATION_MESSAGE_MAX}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={submit} disabled={sending} className="h-12 rounded-2xl font-extrabold gradient-honey text-primary-foreground">
                {sending ? "שולח..." : "שליחת מועמדות"}
              </Button>
              <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={sending} className="h-11 rounded-2xl font-bold">
                ביטול
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ApplyDialog;

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const CONFIRM_PHRASE = "מחק את החשבון";

export function DeleteAccountCard() {
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== CONFIRM_PHRASE) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("admin-manage-users", {
        body: { action: "delete_self" },
      });
      if (error) {
        toast.error("לא הצלחנו למחוק את החשבון. נסו שוב או פנו אלינו ב-privacy@bzb.co.il");
        setDeleting(false);
        return;
      }
      await supabase.auth.signOut();
      toast.success("החשבון נמחק. נתראה 👋");
      navigate("/", { replace: true });
    } catch {
      toast.error("שגיאה במחיקת החשבון");
      setDeleting(false);
    }
  };

  return (
    <><Card className="border-destructive/30">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-foreground">מחיקת חשבון</p>
            <p className="text-xs text-muted-foreground">מחיקה לצמיתות של כל המידע שלך מהמערכת</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            className="rounded-xl font-bold text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive shrink-0"
          >
            <Trash2 className="w-4 h-4" />
            מחיקה
          </Button>
        </div>
      </CardContent>
    </Card>

    <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <DialogContent className="max-w-md rounded-3xl" dir="rtl">
        <DialogHeader>
          <div className="mx-auto mb-2 w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>
          <DialogTitle className="text-center text-xl font-extrabold">מחיקת חשבון</DialogTitle>
          <DialogDescription className="text-center text-sm text-muted-foreground pt-2">
            הפעולה הזו <strong className="text-foreground">בלתי הפיכה</strong>. כל המידע שלך — פרופיל, מטלות, מועמדויות, שיחות והיסטוריה — יימחק לצמיתות ולא ניתן יהיה לשחזר אותו.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          <Label htmlFor="delete-confirm" className="text-sm font-semibold">הקלידו &laquo;מחק את החשבון&raquo; לאישור:</Label>
          <Input
            id="delete-confirm"
            dir="rtl"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="מחק את החשבון"
            className="mt-2 rounded-xl"
          />
        </div>
        <DialogFooter className="flex flex-col sm:flex-col gap-2 mt-4">
          <Button
            variant="destructive"
            disabled={deleteConfirmText !== CONFIRM_PHRASE || deleting}
            onClick={() => void handleDeleteAccount()}
            className="w-full rounded-xl font-bold"
          >
            {deleting ? "מוחק..." : "מחיקה לצמיתות"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText(""); }}
            className="w-full rounded-xl font-bold"
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog></>
  );
}

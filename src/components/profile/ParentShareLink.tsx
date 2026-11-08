import { copyWithToast, shareOrCopy } from "@/lib/share";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Share2, QrCode } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ponytail: minimal QR via external API rendered as <img>. Replace with a
// canvas lib if the Google Charts API ever dies or CSP blocks it.
function qrDataUrl(text: string, size = 200) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
}

interface Props {
  viewToken: string;
}

export function ParentShareLink({ viewToken }: Props) {
  const url = `${window.location.origin}/parent/view/${viewToken}`;
  const [showQr, setShowQr] = useState(false);

  const copyMessages = { success: "הקישור הועתק", failure: "לא הצלחנו להעתיק" };
  const copyLink = () => copyWithToast(url, copyMessages);
  const share = () => shareOrCopy({ title: "BusyBee — מעקב הורה", url }, copyMessages);

  return (
    <>
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={copyLink} className="rounded-full font-bold gap-1">
          <Copy className="h-3.5 w-3.5" />
          העתקה
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={share} className="rounded-full font-bold gap-1">
          <Share2 className="h-3.5 w-3.5" />
          שיתוף
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowQr(true)} className="rounded-full font-bold gap-1">
          <QrCode className="h-3.5 w-3.5" />
          QR
        </Button>
      </div>

      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent className="max-w-xs text-center" dir="rtl">
          <DialogHeader>
            <DialogTitle>סרקו עם הטלפון של ההורה</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <img
              src={qrDataUrl(url, 250)}
              alt="QR code לקישור הורה"
              width={250}
              height={250}
              className="rounded-xl"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            ההורה סורק/ת את הקוד ורואה את הסטטוס שלך — בלי הרשמה.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

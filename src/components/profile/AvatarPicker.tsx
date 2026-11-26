import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, Pencil, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import BeePicker from "@/components/bee-library/BeePicker";
import { uploadAvatar, type AvatarUploadError } from "@/lib/avatarUpload";

const UPLOAD_ERRORS: Record<AvatarUploadError, string> = {
  not_image: "ניתן להעלות רק קובץ תמונה",
  too_large: "התמונה גדולה מדי (מקסימום 10MB)",
  upload_failed: "שגיאה בהעלאת התמונה, נסו שוב",
  profile_failed: "התמונה הועלתה אבל לא נשמרה בפרופיל, נסו שוב",
};

interface AvatarPickerProps {
  userId: string;
  currentAvatarUrl: string | null;
  onAvatarChange: (url: string) => void;
}

export function AvatarPicker({ userId, currentAvatarUrl, onAvatarChange }: AvatarPickerProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { refreshProfile } = useAuth();

  const persist = async (url: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("user_id", userId);

    if (error) {
      toast.error("שגיאה בעדכון התמונה");
      return false;
    }
    onAvatarChange(url);
    await refreshProfile();
    toast.success("התמונה עודכנה!");
    setOpen(false);
    return true;
  };

  const handleSelectBee = (_id: string, src: string) => persist(src);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    // Clear the value so picking the same file again still fires onChange.
    input.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadAvatar(userId, file);
      if (result.error) {
        toast.error(UPLOAD_ERRORS[result.error]);
        return;
      }
      onAvatarChange(result.url);
      await refreshProfile();
      toast.success("התמונה עודכנה!");
      setOpen(false);
    } catch (error) {
      console.error("avatar upload crashed", error);
      toast.error(UPLOAD_ERRORS.upload_failed);
    } finally {
      setUploading(false);
    }
  };

  const displayAvatar = currentAvatarUrl || "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* The name has to come from the button, not the <img>: the image is the
            current value, while the control's job is "change the picture". */}
        <button
          type="button"
          aria-label="שינוי תמונת הפרופיל"
          className="relative group rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <div className="h-[84px] w-[84px] rounded-full border-[3px] border-primary overflow-hidden bg-muted">
            {displayAvatar ? (
              <img src={displayAvatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground">
                <Camera aria-hidden="true" className="w-8 h-8" />
              </div>
            )}
          </div>
          <span className="absolute bottom-0 start-0 grid h-7 w-7 place-items-center rounded-full border border-border bg-card text-foreground shadow-card">
            <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">בחר תמונת פרופיל</DialogTitle>
          <DialogDescription className="text-right">בחר דבורה או העלה תמונה משלך</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="bees" dir="rtl" className="w-full">
          <TabsList aria-label="בחירת תמונת פרופיל" className="grid w-full grid-cols-2">
            <TabsTrigger value="bees">🐝 דבורה</TabsTrigger>
            <TabsTrigger value="upload">העלאה</TabsTrigger>
          </TabsList>

          <TabsContent value="bees" className="mt-4">
            <BeePicker value={null} onChange={handleSelectBee} />
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <label className="flex items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-border hover:border-primary cursor-pointer transition-colors">
              <Upload className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {uploading ? "מעלה..." : "לחץ לבחירת תמונה (מקס׳ 10MB)"}
              </span>
              <input
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
              />
            </label>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

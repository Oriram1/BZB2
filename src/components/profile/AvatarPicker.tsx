import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import BeePicker from "@/components/bee-library/BeePicker";

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
    const file = e.target.files?.[0];
    if (!file) return;

    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("ניתן להעלות רק תמונות (JPEG, PNG, GIF, WebP)");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("הקובץ גדול מדי (מקסימום 10MB)");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${userId}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error("שגיאה בהעלאת הקובץ");
      setUploading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(path);

    await persist(publicUrlData.publicUrl);
    setUploading(false);
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
          <div className="w-24 h-24 rounded-full border-4 border-primary/20 shadow-lg overflow-hidden bg-muted">
            {displayAvatar ? (
              <img src={displayAvatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground">
                <Camera aria-hidden="true" className="w-8 h-8" />
              </div>
            )}
          </div>
          <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex items-center justify-center">
            <Camera aria-hidden="true" className="w-6 h-6 text-white" />
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">בחר תמונת פרופיל</DialogTitle>
          <DialogDescription className="text-right">בחר דבורה או העלה תמונה משלך</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="bees" dir="rtl" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
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
                accept="image/*"
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

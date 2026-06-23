import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import BeePicker from "@/components/bee-library/BeePicker";

const AVATAR_SEEDS = [
  "Felix", "Aneka", "Mimi", "Leo", "Zoe", "Max", "Luna", "Oscar",
  "Bella", "Charlie", "Daisy", "Rocky", "Coco", "Buddy", "Molly", "Bear"
];

const getAvatarUrl = (seed: string) =>
  `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${seed}`;

interface AvatarPickerProps {
  userId: string;
  currentAvatarUrl: string | null;
  onAvatarChange: (url: string) => void;
}

export function AvatarPicker({ userId, currentAvatarUrl, onAvatarChange }: AvatarPickerProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const defaultAvatar = getAvatarUrl(userId);
  const displayAvatar = currentAvatarUrl || defaultAvatar;

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
    toast.success("התמונה עודכנה!");
    setOpen(false);
    return true;
  };

  const handleSelectAvatar = (seed: string) => persist(getAvatarUrl(seed));
  const handleSelectBee = (_id: string, src: string) => persist(src);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("הקובץ גדול מדי (מקסימום 2MB)");
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

    const { data: { publicUrl } } = supabase.storage
      .from("avatars")
      .getPublicUrl(path);

    await persist(`${publicUrl}?t=${Date.now()}`);
    setUploading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="relative group">
          <div className="w-24 h-24 rounded-full border-4 border-primary/20 shadow-lg overflow-hidden bg-muted">
            <img src={displayAvatar} alt="Profile" className="w-full h-full object-cover" />
          </div>
          <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Camera className="w-6 h-6 text-white" />
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">בחר תמונת פרופיל</DialogTitle>
          <DialogDescription className="text-right">בחר דבורה, אווטאר או העלה תמונה משלך</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="bees" dir="rtl" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="bees">🐝 דבורה</TabsTrigger>
            <TabsTrigger value="avatars">אווטאר</TabsTrigger>
            <TabsTrigger value="upload">העלאה</TabsTrigger>
          </TabsList>

          <TabsContent value="bees" className="mt-4">
            <BeePicker value={null} onChange={handleSelectBee} />
          </TabsContent>

          <TabsContent value="avatars" className="mt-4">
            <div className="grid grid-cols-4 gap-3">
              {AVATAR_SEEDS.map((seed) => (
                <button
                  key={seed}
                  onClick={() => handleSelectAvatar(seed)}
                  className={cn(
                    "rounded-full border-2 border-transparent hover:border-primary transition-colors p-1",
                    displayAvatar.includes(`seed=${seed}`) && "border-primary ring-2 ring-primary/30"
                  )}
                >
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-muted">
                    <img
                      src={getAvatarUrl(seed)}
                      alt={seed}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <label className="flex items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-border hover:border-primary cursor-pointer transition-colors">
              <Upload className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {uploading ? "מעלה..." : "לחץ לבחירת תמונה (מקס׳ 2MB)"}
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

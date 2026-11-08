import { useState } from "react";
import { Link as LinkIcon, Trash2, UserRoundSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { fullName, type ParentLinkRow, type ProfileOption } from "@/lib/adminData";
import { PersonRef, Timestamp } from "@/components/admin/shared";

interface FamilyLinksPanelProps {
  adminId: string | undefined;
  links: ParentLinkRow[];
  profilesById: Record<string, ProfileOption>;
  /** Called after a link is created or removed so the page can reload what depends on it. */
  onChanged: () => Promise<void>;
}

export function FamilyLinksPanel({ adminId, links, profilesById, onChanged }: FamilyLinksPanelProps) {
  const [parentQuery, setParentQuery] = useState("");
  const [childQuery, setChildQuery] = useState("");
  const [parentResults, setParentResults] = useState<ProfileOption[]>([]);
  const [childResults, setChildResults] = useState<ProfileOption[]>([]);
  const [selectedParent, setSelectedParent] = useState<ProfileOption | null>(null);
  const [selectedChild, setSelectedChild] = useState<ProfileOption | null>(null);
  const [searchingParent, setSearchingParent] = useState(false);
  const [searchingChild, setSearchingChild] = useState(false);
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [removingLinkId, setRemovingLinkId] = useState<string | null>(null);

  const searchProfiles = async (
    query: string,
    setter: (rows: ProfileOption[]) => void,
    setSearching: (value: boolean) => void,
  ) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setter([]);
      return;
    }

    setSearching(true);
    const safeTerm = trimmed.replace(/[%_,]/g, "");
    const { data, error } = await fetchAllPages((from, to) => supabase
      .from("profiles")
      .select("user_id, first_name, last_name, age")
      .or(`first_name.ilike.%${safeTerm}%,last_name.ilike.%${safeTerm}%`)
      .range(from, to));

    setSearching(false);

    if (error) {
      toast.error("חיפוש המשתמשים נכשל");
      return;
    }

    setter(data ?? []);
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!adminId) return;

    if (!selectedParent || !selectedChild) {
      toast.error("צריך לבחור גם הורה וגם ילד");
      return;
    }

    if (selectedParent.user_id === selectedChild.user_id) {
      toast.error("אי אפשר לקשר משתמש לעצמו");
      return;
    }

    setLinkSubmitting(true);
    try {
      const { error } = await supabase.from("parent_links").insert({
        parent_user_id: selectedParent.user_id,
        child_user_id: selectedChild.user_id,
      });

      if (error) {
        toast.error(error.message.includes("duplicate") ? "הקישור הזה כבר קיים" : "יצירת הקישור נכשלה");
        return;
      }

      await supabase.from("admin_audit_log").insert({
        admin_user_id: adminId,
        action: "link_parent_child",
        target_user_id: selectedChild.user_id,
        target_identifier: `${fullName(selectedParent)} -> ${fullName(selectedChild)}`,
        success: true,
        details: {
          parent_user_id: selectedParent.user_id,
          child_user_id: selectedChild.user_id,
        },
      });

      toast.success("קישור הורה־ילד נוצר");
      setParentQuery("");
      setChildQuery("");
      setParentResults([]);
      setChildResults([]);
      setSelectedParent(null);
      setSelectedChild(null);
      await onChanged();
    } finally {
      setLinkSubmitting(false);
    }
  };

  const handleDeleteLink = async (link: ParentLinkRow) => {
    if (!adminId) return;

    setRemovingLinkId(link.id);

    try {
      const { error } = await supabase.from("parent_links").delete().eq("id", link.id);

      if (error) {
        toast.error("מחיקת הקישור נכשלה");
        return;
      }

      await supabase.from("admin_audit_log").insert({
        admin_user_id: adminId,
        action: "unlink_parent_child",
        target_user_id: link.child_user_id,
        target_identifier: `${profilesById[link.parent_user_id] ? fullName(profilesById[link.parent_user_id]) : link.parent_user_id} -> ${profilesById[link.child_user_id] ? fullName(profilesById[link.child_user_id]) : link.child_user_id}`,
        success: true,
        details: {
          parent_user_id: link.parent_user_id,
          child_user_id: link.child_user_id,
        },
      });

      toast.success("הקישור הוסר");
      await onChanged();
    } finally {
      setRemovingLinkId(null);
    }
  };

  return (
    <>
    <Card className="p-5 space-y-4 border-border/80 shadow-sm">
      <div>
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary-ink">
          <LinkIcon className="h-5 w-5" />
        </div>
        <h3 className="font-extrabold text-lg">ניהול משפחה</h3>
        <p className="text-sm text-muted-foreground">קישור הורה לילד לצורך אזור ההורים</p>
      </div>

      <form onSubmit={handleCreateLink} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="parentQuery">חיפוש הורה</Label>
            <div className="flex gap-2">
              <Input
                id="parentQuery"
                value={parentQuery}
                onChange={(e) => setParentQuery(e.target.value)}
                placeholder="שם פרטי או שם משפחה"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void searchProfiles(parentQuery, setParentResults, setSearchingParent)}
                disabled={searchingParent}
                aria-label="חיפוש הורה"
                className="min-h-11 min-w-11"
              >
                <UserRoundSearch className="h-4 w-4" />
              </Button>
            </div>
            {selectedParent && (
              <div className="text-sm rounded-md border bg-muted px-3 py-2">
                נבחר הורה: {fullName(selectedParent)} {selectedParent.age ? `· גיל ${selectedParent.age}` : ""}
              </div>
            )}
            {parentResults.length > 0 && (
              <div className="space-y-2">
                {parentResults.map((profile) => (
                  <button
                    key={profile.user_id}
                    type="button"
                    className="w-full rounded-md border px-3 py-2 text-start text-sm hover:bg-muted"
                    onClick={() => {
                      setSelectedParent(profile);
                      setParentResults([]);
                      setParentQuery(fullName(profile));
                    }}
                  >
                    <div className="font-medium">
                      <bdi>{fullName(profile)}</bdi>
                    </div>
                    <bdi dir="ltr" className="block font-mono text-xs text-muted-foreground">
                      {profile.user_id}
                    </bdi>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="childQuery">חיפוש ילד</Label>
            <div className="flex gap-2">
              <Input
                id="childQuery"
                value={childQuery}
                onChange={(e) => setChildQuery(e.target.value)}
                placeholder="שם פרטי או שם משפחה"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void searchProfiles(childQuery, setChildResults, setSearchingChild)}
                disabled={searchingChild}
                aria-label="חיפוש ילד"
                className="min-h-11 min-w-11"
              >
                <UserRoundSearch className="h-4 w-4" />
              </Button>
            </div>
            {selectedChild && (
              <div className="text-sm rounded-md border bg-muted px-3 py-2">
                נבחר ילד: {fullName(selectedChild)} {selectedChild.age ? `· גיל ${selectedChild.age}` : ""}
              </div>
            )}
            {childResults.length > 0 && (
              <div className="space-y-2">
                {childResults.map((profile) => (
                  <button
                    key={profile.user_id}
                    type="button"
                    className="w-full rounded-md border px-3 py-2 text-start text-sm hover:bg-muted"
                    onClick={() => {
                      setSelectedChild(profile);
                      setChildResults([]);
                      setChildQuery(fullName(profile));
                    }}
                  >
                    <div className="font-medium">
                      <bdi>{fullName(profile)}</bdi>
                    </div>
                    <bdi dir="ltr" className="block font-mono text-xs text-muted-foreground">
                      {profile.user_id}
                    </bdi>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <Button type="submit" disabled={linkSubmitting} className="w-full min-h-11 rounded-xl font-bold">
          <LinkIcon className="h-4 w-4" />
          {linkSubmitting ? "יוצר קישור..." : "צור קישור הורה־ילד"}
        </Button>
      </form>
    </Card>

    <Card className="p-5 border-border/80 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-extrabold text-lg">קישורי משפחה</h2>
          <p className="text-sm text-muted-foreground">הקישורים האחרונים שנוצרו</p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-sm font-bold tabular-nums">{links.length}</span>
      </div>
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">אין קישורים עדיין</p>
      ) : (
        <ul className="space-y-2">
          {links.map((link) => {
            const parent = profilesById[link.parent_user_id];
            const child = profilesById[link.child_user_id];

            return (
              <li key={link.id} className="border rounded-md p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-sm">
                  <div className="font-medium">
                    הורה: <PersonRef profile={parent} userId={link.parent_user_id} />
                  </div>
                  <div>
                    ילד: <PersonRef profile={child} userId={link.child_user_id} />
                  </div>
                  <Timestamp value={link.created_at} />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleDeleteLink(link)}
                  disabled={removingLinkId === link.id}
                  className="min-h-11"
                >
                  <Trash2 className="h-4 w-4" />
                  {removingLinkId === link.id ? "מסיר..." : "הסר קישור"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
    </>
  );
}

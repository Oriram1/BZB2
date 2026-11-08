import { fullName, type ProfileOption } from "@/lib/adminData";
import { ChevronLeft, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatTime } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";
import { roleLabel } from "@/lib/roles";
import type { Json } from "@/integrations/supabase/types";

export function UserDetailLine({ email, createdAt }: { email?: string; createdAt?: string }) {
  return (
    <p className="mt-2 text-sm text-muted-foreground">
      {email ? (
        <bdi dir="ltr" className="break-all">{email}</bdi>
      ) : (
        <span>ללא אימייל</span>
      )}
      <span aria-hidden="true" className="mx-1.5 text-muted-foreground/60">·</span>
      <span>
        הצטרפות: <bdi dir="ltr" className="tabular-nums">{formatDate(createdAt)}</bdi>
      </span>
    </p>
  );
}

/**
 * A Hebrew name reads RTL; the id fallback is a Latin run and must not. A
 * profile row can exist with both name fields blank, which used to render an
 * empty element and leave the label dangling — fall back to the id for those.
 */
export function PersonRef({
  profile,
  userId,
}: {
  profile?: ProfileOption;
  userId: string;
}) {
  const name = profile ? fullName(profile) : "";
  if (name) return <bdi>{name}</bdi>;
  return (
    <span className="text-muted-foreground">
      ללא שם (<bdi dir="ltr" className="font-mono text-xs">{userId.slice(0, 8)}</bdi>)
    </span>
  );
}

/** Date + time is one Latin run; the surrounding block stays RTL. */
export function Timestamp({ value }: { value: string }) {
  return (
    <div className="mt-1 text-xs text-muted-foreground">
      <bdi dir="ltr" className="tabular-nums">
        {formatDate(value)} {formatTime(new Date(value))}
      </bdi>
    </div>
  );
}


export function StatCard({
  label,
  value,
  loading,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: number;
  loading: boolean;
  icon: typeof Users;
  onClick: () => void;
}) {
  return (
    <Card className="overflow-hidden border-border/80 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-label={`פתיחת פירוט ${label}`}
        className="group min-h-36 w-full cursor-pointer p-4 text-start outline-none transition-colors hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-wait"
      >
        <div className="mb-3 flex items-start justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary-ink">
            <Icon className="h-4 w-4" />
          </div>
          <ChevronLeft className="h-5 w-5 text-muted-foreground transition-transform group-hover:-translate-x-1" />
        </div>
        {loading ? (
          <Skeleton className="mb-2 h-8 w-16" />
        ) : (
          <div className="text-3xl font-black tabular-nums">{value.toLocaleString("he-IL")}</div>
        )}
        <div className="text-sm font-semibold text-muted-foreground">{label}</div>
      </button>
    </Card>
  );
}

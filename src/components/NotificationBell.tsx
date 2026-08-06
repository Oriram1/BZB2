import { useLocation, useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Settings as SettingsIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { formFor } from "@/lib/gender";
import { useNotifications } from "@/hooks/useNotifications";
import { notificationLine } from "@/lib/notificationCopy";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const NotificationBell = ({ variant = "header" }: { variant?: "header" | "drawer" }) => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { items, loading, markRead, markAllRead } = useNotifications();

  if (!user) return null;

  const activeConversationId = location.pathname === "/chat"
    ? new URLSearchParams(location.search).get("conversation")
    : null;
  const visibleItems = items.filter((item) => {
    if (item.event_type !== "message_received" || !activeConversationId) return true;
    return item.data.conversation_id !== activeConversationId;
  });
  const visibleUnreadCount = visibleItems.filter((item) => !item.read_at).length;

  const open = (id: string, link: string | null, unread: boolean) => {
    if (unread) markRead(id);
    if (link) navigate(link);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={visibleUnreadCount > 0 ? `התראות, ${visibleUnreadCount} חדשות` : "התראות"}
          className={cn(
            "relative z-10 shrink-0 w-10 h-10 overflow-visible rounded-full flex items-center justify-center transition-colors",
            variant === "drawer"
              ? "bg-muted hover:bg-muted/80 text-foreground"
              : "bg-white/20 hover:bg-white/30 text-white",
          )}
        >
          <Bell size={19} aria-hidden="true" />
          {visibleUnreadCount > 0 && (
            <span className="pointer-events-none absolute -top-1 -right-1 z-20 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center leading-none">
              {visibleUnreadCount > 9 ? "9+" : visibleUnreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side={variant === "drawer" ? "bottom" : undefined}
        sideOffset={8}
        dir="rtl"
        aria-label="התראות"
        className={cn(
          "overflow-hidden p-0 rounded-2xl shadow-lg",
          variant === "drawer"
            ? "w-64 max-h-80"
            : "w-[min(24rem,calc(100vw-2rem))]",
        )}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <span className="min-w-0 flex-1 text-right font-extrabold text-foreground">התראות</span>
          <div className="flex shrink-0 items-center gap-1">
            {visibleUnreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllRead}
                className="h-8 w-8 p-0"
                aria-label="סמן הכל כנקרא"
              >
                <CheckCheck size={16} />
              </Button>
            )}
            {variant !== "drawer" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/settings")}
                aria-label="הגדרות התראות"
                className="h-8 w-8 p-0"
              >
                <SettingsIcon size={15} />
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className={variant === "drawer" ? "max-h-60" : "max-h-96"} onTouchMove={(e) => e.stopPropagation()} style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">טוען…</p>
          ) : visibleItems.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-3xl mb-2">🐝</p>
              <p className="text-sm text-muted-foreground">אין התראות חדשות</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {visibleItems.map((item) => {
                const line = notificationLine(item, formFor(profile?.gender));
                const unread = !item.read_at;
                const taskId = typeof item.data.task_id === "string" ? item.data.task_id : null;
                const applicationId = typeof item.data.application_id === "string" ? item.data.application_id : null;
                const targetLink = item.event_type === "application_received" && taskId && applicationId
                  ? `/my-tasks?tab=applications&task=${encodeURIComponent(taskId)}&application=${encodeURIComponent(applicationId)}`
                  : item.link;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => open(item.id, targetLink, unread)}
                      className={cn(
                        "w-full px-4 py-3 text-right hover:bg-accent/40 transition-colors",
                        unread && "bg-accent/20",
                      )}
                    >
                      <span className="flex items-center gap-2" dir="rtl">
                        {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
                        <span className="min-w-0 flex-1 truncate">
                          <span className={cn("text-sm text-foreground", unread ? "font-extrabold" : "font-bold")}>
                            {line.title}
                          </span>
                        </span>
                        <span aria-hidden="true" className="shrink-0 text-lg leading-none">{line.emoji}</span>
                      </span>
                      <span className="mt-1 block min-w-0 pr-4" dir="rtl">
                        <span className="block truncate text-sm text-muted-foreground">{line.body}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground/80">
                          {formatRelativeTime(item.created_at)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;

import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Settings as SettingsIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import { notificationLine } from "@/lib/notificationCopy";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const NotificationBell = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { items, loading, unreadCount, markRead, markAllRead } = useNotifications();

  if (!user) return null;

  const open = (id: string, link: string | null, unread: boolean) => {
    if (unread) markRead(id);
    if (link) navigate(link);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `התראות, ${unreadCount} חדשות` : "התראות"}
          className="relative shrink-0 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
        >
          <Bell size={19} aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" dir="rtl" className="w-[min(22rem,calc(100vw-2rem))] p-0 rounded-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-extrabold text-foreground">התראות</span>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllRead}
                className="h-8 px-2 text-xs font-bold gap-1"
              >
                <CheckCheck size={14} />
                סמן הכל כנקרא
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/settings")}
              aria-label="הגדרות התראות"
              className="h-8 w-8 p-0"
            >
              <SettingsIcon size={15} />
            </Button>
          </div>
        </div>

        <ScrollArea className="max-h-96">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">טוען…</p>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-3xl mb-2">🐝</p>
              <p className="text-sm text-muted-foreground">אין התראות חדשות</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => {
                const line = notificationLine(item);
                const unread = !item.read_at;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => open(item.id, item.link, unread)}
                      className={cn(
                        "w-full text-right px-4 py-3 hover:bg-accent/40 transition-colors",
                        unread && "bg-accent/20",
                      )}
                    >
                      <span className="flex flex-row-reverse items-center justify-end gap-2" dir="ltr">
                        <span aria-hidden="true" className="text-lg leading-none">{line.emoji}</span>
                        <span dir="rtl">
                          <span className={cn("text-sm text-foreground", unread ? "font-extrabold" : "font-bold")}>
                            {line.title}
                          </span>
                        </span>
                        {unread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-hidden="true" />}
                      </span>
                      <span className="block min-w-0" dir="rtl">
                        <span className="block text-sm text-muted-foreground truncate">{line.body}</span>
                        <span className="block text-xs text-muted-foreground/80 mt-0.5">
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

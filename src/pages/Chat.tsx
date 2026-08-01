import { useState, useRef, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ArrowRight, Camera, Mic, Phone, MoreVertical } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ChatComposer, { type OutgoingMessage } from "@/components/chat/ChatComposer";
import VoiceNoteBubble from "@/components/chat/VoiceNoteBubble";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useViewportHeight } from "@/hooks/useViewportHeight";

const MEDIA_BUCKET = "chat-media";
/** Signed URLs are re-minted on every visit, so an hour is plenty. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

interface Conversation {
  id: string;
  participant_1: string;
  participant_2: string;
  task_id: string | null;
  otherName: string;
  taskName: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
}

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  attachment_path: string | null;
  attachment_type: "image" | "audio" | null;
  attachment_duration: number | null;
}

/** What a conversation row shows when the last message was a photo or a voice note. */
const previewOf = (message: { content: string; attachment_type: string | null }) => {
  if (message.content) return message.content;
  if (message.attachment_type === "image") return "📷 תמונה";
  if (message.attachment_type === "audio") return "🎤 הודעה קולית";
  return "";
};

const Chat = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedConversation = searchParams.get("conversation");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // The chat is the one screen that must fit the device exactly instead of
  // scrolling as a document — see the hook for what `100vh` gets wrong here.
  useViewportHeight();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // Load conversations
  useEffect(() => {
    if (!user) return;
    const fetchConversations = async () => {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
        .order("updated_at", { ascending: false });

      if (!data) return;

      const convs: Conversation[] = [];
      for (const c of data) {
        const otherId = c.participant_1 === user.id ? c.participant_2 : c.participant_1;
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("user_id", otherId)
          .single();

        let taskName = "";
        if (c.task_id) {
          const { data: task } = await supabase.from("tasks").select("name").eq("id", c.task_id).single();
          taskName = task?.name || "";
        }

        const { data: lastMsg } = await supabase
          .from("messages")
          .select("content, created_at, attachment_type")
          .eq("conversation_id", c.id)
          .order("created_at", { ascending: false })
          .limit(1);

        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", c.id)
          .eq("read", false)
          .neq("sender_id", user.id);

        convs.push({
          id: c.id,
          participant_1: c.participant_1,
          participant_2: c.participant_2,
          task_id: c.task_id,
          otherName: profile ? `${profile.first_name} ${profile.last_name}`.trim() : "משתמש",
          taskName,
          lastMessage: lastMsg?.[0] ? previewOf(lastMsg[0]) : "",
          lastTime: lastMsg?.[0]?.created_at
            ? new Date(lastMsg[0].created_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
            : "",
          unread: count || 0,
        });
      }
      setConversations(convs);
      if (requestedConversation && convs.some((conversation) => conversation.id === requestedConversation)) {
        setActiveChat(requestedConversation);
        setShowSidebar(false);
      } else if (convs.length > 0) {
        setActiveChat((current) => current ?? convs[0].id);
      }
    };
    fetchConversations();
  }, [requestedConversation, user]);

  // Load messages for active chat
  useEffect(() => {
    if (!activeChat) return;
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeChat)
        .order("created_at", { ascending: true });
      setMessages((data as Message[]) || []);
    };
    fetchMessages();

    // Subscribe to realtime messages
    const channel = supabase
      .channel(`messages-${activeChat}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${activeChat}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeChat]);

  // Attachments live in a private bucket, so each one needs a signed URL. They
  // are minted in one batch per render pass rather than one request per bubble.
  useEffect(() => {
    const missing = messages
      .map((message) => message.attachment_path)
      .filter((path): path is string => Boolean(path) && !mediaUrls[path as string]);

    if (missing.length === 0) return;

    let cancelled = false;
    supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrls(missing, SIGNED_URL_TTL_SECONDS)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setMediaUrls((prev) => {
          const next = { ...prev };
          for (const entry of data) {
            if (entry.path && entry.signedUrl) next[entry.path] = entry.signedUrl;
          }
          return next;
        });
      });

    return () => { cancelled = true; };
  }, [messages, mediaUrls]);

  const sendMessage = async ({ text, file, kind, duration }: OutgoingMessage) => {
    if (!user || !activeChat) return;

    let attachmentPath: string | null = null;
    if (file && kind) {
      // The conversation id is the first path segment — that is what the storage
      // policy checks to decide who may read the file.
      const extension = file.name.split(".").pop() || (kind === "image" ? "jpg" : "webm");
      const path = `${activeChat}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });
      if (uploadError) throw uploadError;
      attachmentPath = path;
    }

    const { error } = await supabase.from("messages").insert({
      conversation_id: activeChat,
      sender_id: user.id,
      content: text,
      attachment_path: attachmentPath,
      attachment_type: attachmentPath ? kind ?? null : null,
      attachment_duration: kind === "audio" ? duration ?? null : null,
    });
    if (error) throw error;
  };

  const activeConv = conversations.find((c) => c.id === activeChat);

  if (!user) {
    return (
      <div className="flex h-[var(--app-height)] items-center justify-center bg-muted" dir="rtl">
        <div className="text-center">
          <p className="text-xl font-bold text-foreground mb-4">יש להתחבר כדי לצפות בהודעות</p>
          <Link to="/login">
            <Button className="gradient-honey text-primary-foreground rounded-full font-bold">כניסה 🐝</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    /* One screen, exactly: the height comes from the visible viewport and the
       bottom bar's strip is reserved with padding, so nothing here can push the
       message box out of sight. Everything that grows scrolls internally.
       Fixed and offset by --app-offset because iOS scrolls the document out from
       under a focused field and never scrolls it back; anchored to the visible
       viewport instead, the composer stays on screen while typing. */
    <div
      className="fixed inset-x-0 top-[var(--app-offset)] flex h-[var(--app-height)] flex-col overflow-hidden bg-muted pb-[var(--bottom-nav-height)]"
      dir="rtl"
    >
      <PageHeader title="הודעות" className="shrink-0" />

      <div className="mx-auto flex w-full min-h-0 max-w-6xl flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`${showSidebar ? "flex" : "hidden"} md:flex min-h-0 w-full flex-col border-l border-border bg-card md:w-72 lg:w-80`}>
          <div className="shrink-0 border-b border-border p-3">
            <Input placeholder="חפש שיחה..." className="rounded-2xl h-10 text-sm" />
          </div>
          <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto overscroll-contain">
            {conversations.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                אין שיחות עדיין
              </div>
            ) : conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => { setActiveChat(conv.id); setShowSidebar(false); }}
                className={`w-full p-4 flex items-center gap-3 text-right transition-colors ${
                  activeChat === conv.id ? "bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center text-xl shrink-0">
                  👤
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground text-sm">{conv.otherName}</span>
                    <span className="text-[10px] text-muted-foreground">{conv.lastTime}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{conv.taskName}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
                </div>
                {conv.unread > 0 && (
                  <Badge className="gradient-honey text-primary-foreground border-none rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold p-0 shrink-0">
                    {conv.unread}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className={`${!showSidebar ? "flex" : "hidden"} md:flex min-h-0 flex-1 flex-col bg-card`}>
          {activeConv ? (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b border-border p-2.5 sm:p-3">
                <button onClick={() => setShowSidebar(true)} className="md:hidden" aria-label="חזרה לרשימת השיחות">
                  <ArrowRight size={20} className="text-foreground" />
                </button>
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-lg shrink-0">👤</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-foreground text-sm">{activeConv.otherName}</p>
                  {activeConv.taskName && (
                    <p className="truncate text-[10px] text-muted-foreground">מטלה: {activeConv.taskName}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="rounded-full w-8 h-8" aria-label="שיחת טלפון"><Phone size={16} /></Button>
                  <Button size="icon" variant="ghost" className="rounded-full w-8 h-8" aria-label="אפשרויות נוספות"><MoreVertical size={16} /></Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%23f59e0b' stroke-width='0.3' opacity='0.05'/%3E%3C/svg%3E")`,
              }}>
                <div className="text-center">
                  <Badge variant="secondary" className="rounded-full text-[10px] font-semibold px-3">
                    השיחה נפתחה לאחר קבלה למטלה
                  </Badge>
                </div>
                {messages.map((msg) => {
                  const outgoing = msg.sender_id === user.id;
                  const mediaUrl = msg.attachment_path ? mediaUrls[msg.attachment_path] : undefined;

                  return (
                    <div key={msg.id} className={`flex ${outgoing ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-2.5 py-2 sm:px-4 sm:py-2.5 ${
                        outgoing
                          ? "gradient-honey text-primary-foreground rounded-bl-md"
                          : "bg-muted text-foreground rounded-br-md"
                      }`}>
                        {msg.attachment_type === "image" && (
                          <button
                            type="button"
                            onClick={() => mediaUrl && setLightbox(mediaUrl)}
                            className="mb-1 block w-full"
                            aria-label="הגדלת התמונה"
                          >
                            {mediaUrl ? (
                              <img
                                src={mediaUrl}
                                alt={msg.content || "תמונה בצ׳אט"}
                                loading="lazy"
                                className="max-h-64 w-full rounded-xl object-cover"
                              />
                            ) : (
                              <div className="flex h-32 w-48 max-w-full items-center justify-center rounded-xl bg-foreground/10">
                                <Camera size={22} className="opacity-60" aria-hidden="true" />
                              </div>
                            )}
                          </button>
                        )}

                        {msg.attachment_type === "audio" && (
                          <VoiceNoteBubble src={mediaUrl} duration={msg.attachment_duration} outgoing={outgoing} />
                        )}

                        {msg.content && (
                          <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
                        )}

                        <p className={`text-[10px] mt-1 flex items-center gap-1 ${outgoing ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {msg.attachment_type === "audio" && !msg.content && (
                            <Mic size={10} aria-hidden="true" />
                          )}
                          {new Date(msg.created_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <ChatComposer onSend={sendMessage} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <p>בחר שיחה כדי להתחיל</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={Boolean(lightbox)} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="max-w-[95vw] border-none bg-transparent p-0 shadow-none sm:max-w-3xl">
          {lightbox && (
            <img src={lightbox} alt="תמונה בצ׳אט" className="max-h-[85dvh] w-full rounded-xl object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Chat;

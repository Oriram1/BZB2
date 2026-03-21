import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import bzbLogo from "@/assets/bzb-logo.png";
import { Send, ArrowRight, User, Phone, MoreVertical } from "lucide-react";

const mockConversations = [
  {
    id: 1,
    name: "משפחת לוי",
    task: "ניקיון בית",
    lastMessage: "מצוין, נתראה מחר ב-10!",
    time: "14:32",
    unread: 2,
    avatar: "👩",
  },
  {
    id: 2,
    name: "דוד כהן",
    task: "גיזום גינה",
    lastMessage: "האם יש לך כלי גינה?",
    time: "אתמול",
    unread: 0,
    avatar: "👨",
  },
  {
    id: 3,
    name: "רונית שמיר",
    task: "בייביסיטר ערב",
    lastMessage: "הילדים כבר ישנו, אפשר ללכת",
    time: "שלשום",
    unread: 0,
    avatar: "👩‍🦰",
  },
];

const mockMessages = [
  { id: 1, sender: "them", text: "היי! ראיתי שאתה מעוניין במטלת הניקיון", time: "14:20" },
  { id: 2, sender: "me", text: "כן! אני זמין מחר בבוקר", time: "14:22" },
  { id: 3, sender: "them", text: "מעולה, הדירה ברחוב דיזנגוף 50, 3 חדרים", time: "14:25" },
  { id: 4, sender: "me", text: "אין בעיה, כמה שעות זה אמור לקחת?", time: "14:27" },
  { id: 5, sender: "them", text: "בערך 3 שעות. יש סמרטוט וחומרי ניקוי בבית", time: "14:28" },
  { id: 6, sender: "me", text: "סבבה, אגיע ב-10 בבוקר 👍", time: "14:30" },
  { id: 7, sender: "them", text: "מצוין, נתראה מחר ב-10!", time: "14:32" },
];

const Chat = () => {
  const [activeChat, setActiveChat] = useState(1);
  const [messages, setMessages] = useState(mockMessages);
  const [newMessage, setNewMessage] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!newMessage.trim()) return;
    const now = new Date();
    setMessages((prev) => [...prev, {
      id: prev.length + 1,
      sender: "me",
      text: newMessage,
      time: `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`,
    }]);
    setNewMessage("");
  };

  const activeConv = mockConversations.find((c) => c.id === activeChat);

  return (
    <div className="h-screen flex flex-col bg-muted" dir="rtl">
      {/* Header */}
      <header className="gradient-honey py-3 px-4 shadow-md z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={bzbLogo} alt="BZB" className="w-8 h-8" />
            <span className="font-extrabold text-primary-foreground">BZB</span>
          </Link>
          <span className="font-bold text-primary-foreground text-sm">הודעות</span>
          <Link to="/tasks">
            <Button size="sm" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 rounded-full font-semibold">
              <ArrowRight size={16} />
              חזרה
            </Button>
          </Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden max-w-6xl mx-auto w-full">
        {/* Conversations sidebar */}
        <div className={`${showSidebar ? "flex" : "hidden"} md:flex flex-col w-full md:w-80 border-l border-border bg-card`}>
          <div className="p-3 border-b border-border">
            <Input placeholder="חפש שיחה..." className="rounded-2xl h-10 text-sm" />
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {mockConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => { setActiveChat(conv.id); setShowSidebar(false); }}
                className={`w-full p-4 flex items-center gap-3 text-right transition-colors ${
                  activeChat === conv.id ? "bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center text-xl shrink-0">
                  {conv.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground text-sm">{conv.name}</span>
                    <span className="text-[10px] text-muted-foreground">{conv.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{conv.task}</p>
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
        <div className={`${!showSidebar ? "flex" : "hidden"} md:flex flex-col flex-1 bg-card`}>
          {/* Chat header */}
          <div className="p-3 border-b border-border flex items-center gap-3">
            <button onClick={() => setShowSidebar(true)} className="md:hidden">
              <ArrowRight size={20} className="text-foreground" />
            </button>
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-lg">
              {activeConv?.avatar}
            </div>
            <div className="flex-1">
              <p className="font-bold text-foreground text-sm">{activeConv?.name}</p>
              <p className="text-[10px] text-muted-foreground">מטלה: {activeConv?.task}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="rounded-full w-8 h-8"><Phone size={16} /></Button>
              <Button size="icon" variant="ghost" className="rounded-full w-8 h-8"><MoreVertical size={16} /></Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%23f59e0b' stroke-width='0.3' opacity='0.05'/%3E%3C/svg%3E")`,
          }}>
            <div className="text-center">
              <Badge variant="secondary" className="rounded-full text-[10px] font-semibold px-3">
                השיחה נפתחה לאחר קבלה למטלה
              </Badge>
            </div>
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === "me" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  msg.sender === "me"
                    ? "gradient-honey text-primary-foreground rounded-bl-md"
                    : "bg-muted text-foreground rounded-br-md"
                }`}>
                  <p className="text-sm">{msg.text}</p>
                  <p className={`text-[10px] mt-1 ${msg.sender === "me" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {msg.time}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border">
            <div className="flex items-center gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="הקלד הודעה..."
                className="rounded-2xl h-11 flex-1"
              />
              <Button
                onClick={sendMessage}
                disabled={!newMessage.trim()}
                size="icon"
                className="gradient-honey text-primary-foreground rounded-full w-11 h-11 border-none hover:scale-105 transition-transform shrink-0"
              >
                <Send size={18} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;

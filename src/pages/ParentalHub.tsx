import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import bzbLogo from "@/assets/bzb-logo.png";
import { Shield, MapPin, Bell, Clock, CheckCircle2, AlertCircle, User } from "lucide-react";

const mockChild = {
  name: "יואב כהן",
  age: 15,
  activeTask: {
    name: "ניקיון בית",
    location: "תל אביב, רח׳ דיזנגוף 50",
    status: "in-progress" as const,
    startTime: "10:00",
    estimatedEnd: "13:00",
    taskerName: "משפחת לוי",
  },
};

const mockNotifications = [
  { id: 1, type: "accepted" as const, message: "יואב התקבל למטלה ״ניקיון בית״", time: "לפני 2 שעות", read: false },
  { id: 2, type: "started" as const, message: "יואב התחיל לעבוד על ״ניקיון בית״", time: "לפני שעה", read: false },
  { id: 3, type: "completed" as const, message: "יואב סיים את המטלה ״טיול עם כלב״", time: "אתמול", read: true },
  { id: 4, type: "payment" as const, message: "תשלום של ₪40 התקבל עבור ״טיול עם כלב״", time: "אתמול", read: true },
];

const ParentalHub = () => {
  const [beePosition, setBeePosition] = useState({ x: 45, y: 40 });

  // Simulate real-time movement
  useEffect(() => {
    const interval = setInterval(() => {
      setBeePosition((prev) => ({
        x: prev.x + (Math.random() - 0.5) * 3,
        y: prev.y + (Math.random() - 0.5) * 3,
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-muted relative" dir="rtl">
      <div className="absolute top-40 left-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />

      <header className="gradient-honey py-4 px-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={bzbLogo} alt="BZB" className="w-10 h-10" />
            <span className="font-extrabold text-primary-foreground text-lg">BZB</span>
          </Link>
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-primary-foreground" />
            <span className="font-bold text-primary-foreground text-sm">לוח בקרה הורי</span>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto py-8 px-4 relative z-10">
        {/* Child info */}
        <div className="glass rounded-3xl p-6 border border-border mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full gradient-honey flex items-center justify-center text-primary-foreground">
              <User size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-foreground">{mockChild.name}</h1>
              <p className="text-muted-foreground text-sm">גיל {mockChild.age} • מטלה פעילה כרגע</p>
            </div>
            <Badge className="gradient-honey text-primary-foreground border-none rounded-xl font-bold mr-auto">
              🟢 פעיל/ה
            </Badge>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Live Map */}
          <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-lg">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <MapPin size={18} className="text-primary" />
              <h2 className="font-extrabold text-foreground">מיקום בזמן אמת</h2>
              <div className="mr-auto flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-muted-foreground font-semibold">Live</span>
              </div>
            </div>
            <div className="relative h-[350px] bg-gradient-to-br from-emerald-100 via-green-50 to-teal-50">
              {/* Grid lines */}
              <div className="absolute inset-0 opacity-10" style={{
                backgroundImage: `
                  linear-gradient(hsl(var(--border)) 1px, transparent 1px),
                  linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)
                `,
                backgroundSize: "40px 40px",
              }} />
              
              {/* Task location pin */}
              <div className="absolute z-10" style={{ left: "50%", top: "35%" }}>
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-destructive/20 border-2 border-destructive flex items-center justify-center">
                    <MapPin size={14} className="text-destructive" />
                  </div>
                  <span className="text-[9px] bg-card/90 px-2 py-0.5 rounded-full font-bold mt-1 whitespace-nowrap">
                    {mockChild.activeTask.location.split(",")[0]}
                  </span>
                </div>
              </div>

              {/* Bee (child) moving position */}
              <div
                className="absolute z-20 transition-all duration-[2000ms] ease-in-out"
                style={{ left: `${beePosition.x}%`, top: `${beePosition.y}%` }}
              >
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full gradient-honey border-2 border-primary-foreground shadow-glow flex items-center justify-center animate-bounce-subtle">
                    <span className="text-lg">🐝</span>
                  </div>
                  <span className="text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-bold mt-1">
                    {mockChild.name.split(" ")[0]}
                  </span>
                </div>
              </div>

              {/* Distance line */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-5">
                <line
                  x1="50%" y1="35%"
                  x2={`${beePosition.x}%`} y2={`${beePosition.y}%`}
                  stroke="hsl(25 100% 55%)" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.4"
                />
              </svg>
            </div>
            {/* Active task info */}
            <div className="p-4 bg-muted/50 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-foreground text-sm">{mockChild.activeTask.name}</p>
                  <p className="text-xs text-muted-foreground">אצל {mockChild.activeTask.taskerName}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock size={12} />{mockChild.activeTask.startTime} - {mockChild.activeTask.estimatedEnd}</p>
                  <Badge variant="secondary" className="text-[10px] mt-1 rounded-lg font-bold">בביצוע</Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-lg">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Bell size={18} className="text-primary" />
              <h2 className="font-extrabold text-foreground">התראות</h2>
              <Badge variant="secondary" className="mr-auto rounded-lg text-xs font-bold">
                {mockNotifications.filter(n => !n.read).length} חדשות
              </Badge>
            </div>
            <div className="divide-y divide-border max-h-[450px] overflow-y-auto">
              {mockNotifications.map((notif) => (
                <div key={notif.id} className={`p-4 flex items-start gap-3 transition-colors ${!notif.read ? "bg-primary/5" : ""}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    notif.type === "accepted" ? "bg-blue-100 text-blue-600" :
                    notif.type === "started" ? "bg-amber-100 text-amber-600" :
                    notif.type === "completed" ? "bg-green-100 text-green-600" :
                    "bg-emerald-100 text-emerald-600"
                  }`}>
                    {notif.type === "accepted" ? <CheckCircle2 size={16} /> :
                     notif.type === "started" ? <AlertCircle size={16} /> :
                     notif.type === "completed" ? <CheckCircle2 size={16} /> :
                     <DollarSignIcon />}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm ${!notif.read ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                      {notif.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{notif.time}</p>
                  </div>
                  {!notif.read && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DollarSignIcon = () => <span className="text-sm">₪</span>;

export default ParentalHub;

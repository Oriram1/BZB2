import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import bzbLogo from "@/assets/bzb-logo.png";
import { Shield, MapPin, Bell, Clock, CheckCircle2, AlertCircle, User, ArrowLeft, DollarSign } from "lucide-react";
import { useGoogleMaps } from "@/components/tasks/GoogleMapsProvider";

const TASK_LOCATION = { lat: 32.0753, lng: 34.7754 };

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
    lat: TASK_LOCATION.lat,
    lng: TASK_LOCATION.lng,
  },
};

const mockNotifications = [
  { id: 1, type: "accepted" as const, message: "יואב התקבל למטלה ״ניקיון בית״", time: "לפני 2 שעות", read: false },
  { id: 2, type: "started" as const, message: "יואב התחיל לעבוד על ״ניקיון בית״", time: "לפני שעה", read: false },
  { id: 3, type: "completed" as const, message: "יואב סיים את המטלה ״טיול עם כלב״", time: "אתמול", read: true },
  { id: 4, type: "payment" as const, message: "תשלום של ₪40 התקבל עבור ״טיול עם כלב״", time: "אתמול", read: true },
];

const ParentalHub = () => {
  const navigate = useNavigate();
  const [beePosition, setBeePosition] = useState({ lat: 32.0763, lng: 34.7734 });

  const { isLoaded } = useGoogleMaps();

  // Simulate real-time movement
  useEffect(() => {
    const interval = setInterval(() => {
      setBeePosition((prev) => ({
        lat: prev.lat + (Math.random() - 0.5) * 0.001,
        lng: prev.lng + (Math.random() - 0.5) * 0.001,
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
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft size={20} />
            </Button>
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
            {isLoaded ? (
              <GoogleMap
                mapContainerStyle={{ height: "350px", width: "100%" }}
                center={TASK_LOCATION}
                zoom={15}
                options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
              >
                <Marker position={TASK_LOCATION} label="📍" />
                <Marker position={beePosition} label="🐝" />
              </GoogleMap>
            ) : (
              <div style={{ height: "350px" }} className="flex items-center justify-center bg-muted">
                <p className="text-muted-foreground">טוען מפה...</p>
              </div>
            )}
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

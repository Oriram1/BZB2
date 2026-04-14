import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import bzbLogo from "@/assets/bzb-logo.png";
import { Shield, MapPin, Bell, Clock, CheckCircle2, AlertCircle, User, ArrowLeft } from "lucide-react";

const TASK_LOCATION: [number, number] = [32.0753, 34.7754]; // Dizengoff, Tel Aviv

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
    lat: TASK_LOCATION[0],
    lng: TASK_LOCATION[1],
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
  const [beeLatLng, setBeeLatLng] = useState<[number, number]>([32.0763, 34.7734]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const beeMarkerRef = useRef<L.Marker | null>(null);

  // Simulate real-time movement
  useEffect(() => {
    const interval = setInterval(() => {
      setBeeLatLng((prev) => [
        prev[0] + (Math.random() - 0.5) * 0.001,
        prev[1] + (Math.random() - 0.5) * 0.001,
      ]);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, { zoomControl: false }).setView(TASK_LOCATION, 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);

    // Task location marker
    const taskIcon = L.divIcon({
      className: "task-pin",
      html: `<div style="width:32px;height:32px;border-radius:50%;background:hsl(0 84% 60%/0.2);border:2px solid hsl(0 84% 60%);display:flex;align-items:center;justify-content:center;"><span style="font-size:14px;">📍</span></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    });
    L.marker(TASK_LOCATION, { icon: taskIcon }).addTo(map)
      .bindPopup(`<strong>${mockChild.activeTask.location}</strong>`);

    // Bee marker
    const beeIcon = L.divIcon({
      className: "bee-marker",
      html: `<div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#FCD34D,#F59E0B);border:3px solid white;box-shadow:0 0 16px rgba(245,158,11,0.5);display:flex;align-items:center;justify-content:center;font-size:22px;">🐝</div>`,
      iconSize: [42, 42],
      iconAnchor: [21, 21],
    });
    beeMarkerRef.current = L.marker(beeLatLng, { icon: beeIcon }).addTo(map)
      .bindPopup(`<strong>${mockChild.name}</strong>`);

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Update bee position on map
  useEffect(() => {
    if (beeMarkerRef.current) {
      beeMarkerRef.current.setLatLng(beeLatLng);
    }
  }, [beeLatLng]);

  return (
    <div className="min-h-screen bg-muted relative" dir="rtl">
      <div className="absolute top-40 left-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />

      <header className="gradient-honey py-4 px-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft size={20} />
            </Button>
            <Link to="/" className="flex items-center gap-2">
              <img src={bzbLogo} alt="BZB" className="w-10 h-10" />
              <span className="font-extrabold text-primary-foreground text-lg">BZB</span>
            </Link>
          </div>
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
            <div ref={mapContainerRef} style={{ height: "350px", width: "100%" }} />
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

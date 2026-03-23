import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DollarSign, Calendar, Clock, MapPin } from "lucide-react";
import CategoryIcon from "./CategoryIcon";
import type { Task } from "./TaskCard";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const categoryEmoji: Record<string, string> = {
  housework: "🏠",
  handyman: "🔧",
  tutoring: "📚",
  babysitting: "👶",
  pets: "🐾",
  gardening: "🌿",
  other: "📦",
};

const MapView = ({ tasks }: { tasks: Task[] }) => {
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const selected = tasks.find((t) => t.id === selectedTask);
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: [number, number] = tasks.length > 0
      ? [tasks.reduce((s, t) => s + t.lat, 0) / tasks.length, tasks.reduce((s, t) => s + t.lng, 0) / tasks.length]
      : [32.08, 34.78];

    const map = L.map(containerRef.current, { zoomControl: false }).setView(center, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    tasks.forEach((task) => {
      const emoji = categoryEmoji[task.category] || "📌";
      const icon = L.divIcon({
        className: "custom-task-marker",
        html: `<div style="
          width:40px;height:40px;border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          font-size:20px;
          background:${task.id === selectedTask ? "linear-gradient(135deg,#FCD34D,#F59E0B)" : "white"};
          border:3px solid ${task.id === selectedTask ? "#B45309" : "#E5E7EB"};
          box-shadow:0 4px 12px rgba(0,0,0,0.2);
          cursor:pointer;
        ">${emoji}</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
      });

      const marker = L.marker([task.lat, task.lng], { icon }).addTo(map);
      marker.on("click", () => {
        setSelectedTask((prev) => (prev === task.id ? null : task.id));
      });
      markersRef.current.push(marker);
    });

    if (tasks.length > 0) {
      const bounds = L.latLngBounds(tasks.map((t) => [t.lat, t.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [tasks, selectedTask]);

  return (
    <div className="rounded-3xl overflow-hidden border border-border shadow-lg animate-fade-in relative">
      <div ref={containerRef} style={{ height: "500px", width: "100%" }} />

      {selected && (
        <div className="absolute bottom-4 left-4 right-4 bg-card rounded-2xl p-4 border border-border shadow-xl animate-slide-up z-[1000]">
          <div className="flex items-start gap-3">
            <CategoryIcon category={selected.category} />
            <div className="flex-1">
              <h3 className="font-extrabold text-foreground">{selected.name}</h3>
              <p className="text-sm text-muted-foreground">{selected.shortDesc}</p>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><DollarSign size={12} />₪{selected.payment}/{selected.paymentType === "hour" ? "שעה" : "משימה"}</span>
                <span className="flex items-center gap-1"><MapPin size={12} />{selected.distance} ק״מ</span>
                <span className="flex items-center gap-1"><Calendar size={12} />{selected.date}</span>
                <span className="flex items-center gap-1"><Clock size={12} />{selected.time}</span>
              </div>
            </div>
            <Button size="sm" className="gradient-honey text-primary-foreground rounded-full border-none font-bold shrink-0 hover:scale-105 active:scale-95 transition-transform duration-300">
              אני מעוניין/ת 🐝
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapView;

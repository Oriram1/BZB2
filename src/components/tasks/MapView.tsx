import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DollarSign, Calendar, Clock, MapPin } from "lucide-react";
import CategoryIcon from "./CategoryIcon";
import type { Task } from "./TaskCard";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const categoryEmoji: Record<string, string> = {
  housework: "🏠",
  handyman: "🔧",
  tutoring: "📚",
  babysitting: "👶",
  pets: "🐾",
  gardening: "🌿",
  other: "📦",
};

const createTaskIcon = (category: string, isSelected: boolean) => {
  const emoji = categoryEmoji[category] || "📌";
  return L.divIcon({
    className: "custom-task-marker",
    html: `<div style="
      width: 40px; height: 40px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px;
      background: ${isSelected ? "linear-gradient(135deg, #FCD34D, #F59E0B)" : "white"};
      border: 3px solid ${isSelected ? "#B45309" : "#E5E7EB"};
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      transition: all 0.3s;
      transform: ${isSelected ? "scale(1.3)" : "scale(1)"};
    ">${emoji}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });
};

const FitBounds = ({ tasks }: { tasks: Task[] }) => {
  const map = useMap();
  useEffect(() => {
    if (tasks.length > 0) {
      const bounds = L.latLngBounds(tasks.map((t) => [t.lat, t.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [tasks, map]);
  return null;
};

const MapView = ({ tasks }: { tasks: Task[] }) => {
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const selected = tasks.find((t) => t.id === selectedTask);

  const center: [number, number] = tasks.length > 0
    ? [tasks.reduce((s, t) => s + t.lat, 0) / tasks.length, tasks.reduce((s, t) => s + t.lng, 0) / tasks.length]
    : [32.08, 34.78];

  return (
    <div className="rounded-3xl overflow-hidden border border-border shadow-lg animate-fade-in relative">
      <MapContainer
        center={center}
        zoom={12}
        style={{ height: "500px", width: "100%" }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds tasks={tasks} />
        {tasks.map((task) => (
          <Marker
            key={task.id}
            position={[task.lat, task.lng]}
            icon={createTaskIcon(task.category, task.id === selectedTask)}
            eventHandlers={{
              click: () => setSelectedTask(task.id === selectedTask ? null : task.id),
            }}
          >
            <Popup>
              <div className="text-right" dir="rtl">
                <strong>{task.name}</strong>
                <br />
                <span className="text-sm text-gray-600">{task.shortDesc}</span>
                <br />
                <span className="text-sm font-bold">₪{task.payment}</span>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

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

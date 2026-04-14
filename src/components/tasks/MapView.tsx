import { useState, useCallback } from "react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { Button } from "@/components/ui/button";
import { DollarSign, Calendar, Clock, MapPin } from "lucide-react";
import CategoryIcon from "./CategoryIcon";
import type { Task } from "./TaskCard";
import { useGoogleMaps } from "./GoogleMapsProvider";

const containerStyle = {
  width: "100%",
  height: "500px",
};

const MapView = ({ tasks }: { tasks: Task[] }) => {
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const selected = tasks.find((t) => t.id === selectedTask);
  const { isLoaded } = useGoogleMaps();

  const center =
    tasks.length > 0
      ? {
          lat: tasks.reduce((s, t) => s + t.lat, 0) / tasks.length,
          lng: tasks.reduce((s, t) => s + t.lng, 0) / tasks.length,
        }
      : { lat: 32.08, lng: 34.78 };

  const handleMarkerClick = useCallback((taskId: number) => {
    setSelectedTask((prev) => (prev === taskId ? null : taskId));
  }, []);

  if (!isLoaded) {
    return (
      <div className="rounded-3xl overflow-hidden border border-border shadow-lg h-[500px] flex items-center justify-center bg-muted">
        <p className="text-muted-foreground">טוען מפה...</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl overflow-hidden border border-border shadow-lg animate-fade-in relative">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={12}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        }}
      >
        {tasks.map((task) => (
          <Marker
            key={task.id}
            position={{ lat: task.lat, lng: task.lng }}
            onClick={() => handleMarkerClick(task.id)}
          />
        ))}
      </GoogleMap>

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

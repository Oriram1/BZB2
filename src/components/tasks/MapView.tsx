import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DollarSign, Calendar, Clock, MapPin } from "lucide-react";
import CategoryIcon from "./CategoryIcon";
import type { Task } from "./TaskCard";
import { useGoogleMaps } from "./GoogleMapsProvider";
import { useAuth } from "@/contexts/AuthContext";

const MapView = ({ tasks }: { tasks: Task[] }) => {
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const selected = tasks.find((t) => t.id === selectedTask);
  const { isLoaded, error } = useGoogleMaps();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOwnTask = !!selected && !!user && selected.creatorId === user.id;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  /** Only tasks that actually carry coordinates can be put on a map. */
  const located = useMemo(
    () => tasks.filter(
      (t): t is Task & { lat: number; lng: number } => t.lat !== null && t.lng !== null,
    ),
    [tasks],
  );

  const center = useMemo(
    () => located.length > 0
      ? {
          lat: located.reduce((s, t) => s + t.lat, 0) / located.length,
          lng: located.reduce((s, t) => s + t.lng, 0) / located.length,
        }
      : { lat: 32.08, lng: 34.78 },
    [located],
  );

  useEffect(() => {
    if (!isLoaded || !containerRef.current || mapRef.current) return;

    mapRef.current = new google.maps.Map(containerRef.current, {
      center,
      zoom: 12,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    });
  }, [center, isLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    located.forEach((task) => {
      const marker = new google.maps.Marker({
        position: { lat: task.lat, lng: task.lng },
        map,
      });
      marker.addListener("click", () => {
        setSelectedTask((prev) => (prev === task.id ? null : task.id));
      });
      markersRef.current.push(marker);
    });

    if (located.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      located.forEach((t) => bounds.extend({ lat: t.lat, lng: t.lng }));
      map.fitBounds(bounds, 50);
    }
  }, [isLoaded, located]);

  if (!isLoaded) {
    return (
      <div className="rounded-3xl overflow-hidden border border-border shadow-lg h-[500px] flex items-center justify-center bg-muted text-center px-4">
        <div className="space-y-2">
          <p className="text-muted-foreground">טוען מפה...</p>
          {error && <p className="text-xs text-destructive leading-relaxed">{error}</p>}
        </div>
      </div>
    );
  }

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
                {selected.distance !== undefined && (
                  <span className="flex items-center gap-1"><MapPin size={12} />{selected.distance.toFixed(2)} ק״מ</span>
                )}
                <span className="flex items-center gap-1"><Calendar size={12} />{selected.date}</span>
                <span className="flex items-center gap-1"><Clock size={12} />{selected.time}</span>
              </div>
            </div>
            {isOwnTask ? (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full font-bold shrink-0 hover:scale-105 active:scale-95 transition-transform duration-300"
                onClick={() => selected.dbId && navigate(`/task/${selected.dbId}`)}
              >
                לפרטי המודעה
              </Button>
            ) : (
              <Button
                size="sm"
                className="gradient-honey text-primary-foreground rounded-full border-none font-bold shrink-0 hover:scale-105 active:scale-95 transition-transform duration-300"
              >
                אני מעוניין/ת 🐝
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapView;

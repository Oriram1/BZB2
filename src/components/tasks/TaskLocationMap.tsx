import { useEffect, useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import AddressMapPreview from "./AddressMapPreview";
import { geocodeAddress } from "@/lib/geocodeAddress";

interface TaskLocationMapProps {
  location: string;
  latitude: number | null;
  longitude: number | null;
  taskName: string;
}

const TaskLocationMap = ({ location, latitude, longitude, taskName }: TaskLocationMapProps) => {
  const [position, setPosition] = useState(
    latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (position || !location.trim()) return;
    let cancelled = false;
    setLoading(true);
    geocodeAddress(location).then((result) => {
      if (cancelled) return;
      if (result) setPosition({ lat: result.lat, lng: result.lng });
      else setError("לא הצלחנו לאתר את המיקום במפה.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [location, position]);

  if (position) return <AddressMapPreview lat={position.lat} lng={position.lng} label={taskName || location} />;

  return <div className="rounded-2xl border border-border/60 bg-muted/40 p-4 text-sm">
    <div className="flex items-center gap-2 text-muted-foreground"><MapPin size={16} aria-hidden="true" /><span>{loading ? "מאתר את המקום במפה..." : error || "לא נמצא מיקום במפה."}</span></div>
    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-4 font-bold">
      <ExternalLink size={16} aria-hidden="true" /> פתיחה ב-Google Maps
    </a>
  </div>;
};

export default TaskLocationMap;

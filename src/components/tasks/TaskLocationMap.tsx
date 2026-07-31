import { useEffect, useRef, useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import { useGoogleMaps } from "./GoogleMapsProvider";
import { geocodeAddress } from "@/lib/geocodeAddress";

interface TaskLocationMapProps {
  location: string;
  latitude: number | null;
  longitude: number | null;
  taskName: string;
}

const TaskLocationMap = ({ location, latitude, longitude, taskName }: TaskLocationMapProps) => {
  const { isLoaded, error } = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(
    latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : null,
  );

  useEffect(() => {
    if (!isLoaded || position || !location.trim()) return;
    let cancelled = false;
    void geocodeAddress(location).then((result) => {
      if (!cancelled && result) setPosition({ lat: result.lat, lng: result.lng });
    });
    return () => { cancelled = true; };
  }, [isLoaded, location, position]);

  useEffect(() => {
    if (!isLoaded || !position || !containerRef.current || mapRef.current) return;
    const map = new google.maps.Map(containerRef.current, {
      center: position,
      zoom: 15,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    });
    new google.maps.Marker({ position, map, title: taskName });
    mapRef.current = map;
  }, [isLoaded, position, taskName]);

  if (!isLoaded) return <div className="flex h-64 items-center justify-center rounded-2xl bg-muted px-4 text-center text-sm text-muted-foreground">{error || "טוען מפה..."}</div>;
  if (!position) return <div className="rounded-2xl border border-border/60 bg-muted/40 p-4 text-sm"><div className="flex items-center gap-2 text-muted-foreground"><MapPin size={16} />לא הצלחנו לאתר את המיקום במפה.</div><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border bg-card px-4 font-bold"><ExternalLink size={16} />פתיחה ב־Google Maps</a></div>;
  return <div ref={containerRef} className="h-64 w-full rounded-2xl" aria-label={`מפה של ${location}`} />;
};

export default TaskLocationMap;

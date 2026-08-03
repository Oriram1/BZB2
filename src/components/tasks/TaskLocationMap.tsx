import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { useGoogleMaps } from "./GoogleMapsProvider";
import { geocodeAddress } from "@/lib/geocodeAddress";

interface TaskLocationMapProps {
  location: string;
  latitude: number | null;
  longitude: number | null;
  taskName: string;
}

const GoogleMapsLogo = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
    <path fill="#4285F4" d="M12 1.5a8 8 0 0 0-8 8c0 5.7 8 13 8 13s8-7.3 8-13a8 8 0 0 0-8-8Z" />
    <path fill="#34A853" d="M4.7 6.2A8 8 0 0 0 4 9.5c0 5.7 8 13 8 13v-9.1L4.7 6.2Z" />
    <path fill="#FBBC04" d="M12 1.5a8 8 0 0 0-7.3 4.7l7.3 7.2 4.8-8.9A8 8 0 0 0 12 1.5Z" />
    <path fill="#EA4335" d="M16.8 4.5 12 13.4a4 4 0 1 0 4.8-8.9Z" />
    <circle cx="12" cy="9.5" r="2.4" fill="#fff" />
  </svg>
);

const WazeLogo = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
    <path fill="#33CCFF" d="M12.6 3.1a8.1 8.1 0 0 0-8.2 8c0 1.2.3 2.3.8 3.3L3 17.7l4-.5a8.7 8.7 0 0 0 5.6 2c4.7 0 8.4-3.6 8.4-8.1s-3.7-8-8.4-8Z" />
    <circle cx="9.7" cy="10.2" r="1" fill="#263238" />
    <circle cx="15.3" cy="10.2" r="1" fill="#263238" />
    <path d="M9.5 13.2c1.8 1.5 4.2 1.5 6 0" fill="none" stroke="#263238" strokeWidth="1.3" strokeLinecap="round" />
    <circle cx="8" cy="18.2" r="1.7" fill="#263238" />
    <circle cx="17" cy="18.2" r="1.7" fill="#263238" />
  </svg>
);

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

  const destination = position ? `${position.lat},${position.lng}` : location;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
  const wazeDestination = position
    ? `ll=${encodeURIComponent(destination)}`
    : `q=${encodeURIComponent(location)}`;
  const wazeUrl = `https://waze.com/ul?${wazeDestination}&navigate=yes&utm_source=bzb`;

  const navigationLinks = (
    <div className="grid grid-cols-2 gap-2 pt-2" dir="rtl">
      <a
        href={googleMapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-bold text-foreground transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`ניווט אל ${location} באמצעות Google Maps`}
      >
        <GoogleMapsLogo />
        Google Maps
      </a>
      <a
        href={wazeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-bold text-foreground transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`ניווט אל ${location} באמצעות Waze`}
      >
        <WazeLogo />
        Waze
      </a>
    </div>
  );

  if (!isLoaded) return <div className="flex h-64 items-center justify-center rounded-2xl bg-muted px-4 text-center text-sm text-muted-foreground">{error || "טוען מפה..."}</div>;
  if (!position) return <div><div className="rounded-2xl border border-border/60 bg-muted/40 p-4 text-sm"><div className="flex items-center gap-2 text-muted-foreground"><MapPin size={16} />לא הצלחנו לאתר את המיקום במפה.</div></div>{navigationLinks}</div>;
  return <div><div ref={containerRef} className="h-64 w-full rounded-2xl" aria-label={`מפה של ${location}`} />{navigationLinks}</div>;
};

export default TaskLocationMap;

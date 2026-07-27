import { useEffect, useRef, useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import { useGoogleMaps } from "./GoogleMapsProvider";

interface TaskLocationMapProps {
  location: string;
  latitude: number | null;
  longitude: number | null;
  taskName: string;
}

const googleMapsUrl = (location: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;

const TaskLocationMap = ({ location, latitude, longitude, taskName }: TaskLocationMapProps) => {
  const { isLoaded, error } = useGoogleMaps();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [resolvedPosition, setResolvedPosition] = useState<{ lat: number; lng: number } | null>(
    latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : null,
  );
  const [geocoding, setGeocoding] = useState(false);
  const [geocodingError, setGeocodingError] = useState<string | null>(null);
  const hasCoordinates = resolvedPosition !== null;

  useEffect(() => {
    if (!isLoaded || resolvedPosition || !location.trim()) return;

    let cancelled = false;
    setGeocoding(true);
    setGeocodingError(null);

    new google.maps.Geocoder().geocode(
      { address: location, region: "IL" },
      (results, status) => {
        if (cancelled) return;

        const firstResult = results?.[0];
        if (status === "OK" && firstResult) {
          const position = firstResult.geometry.location;
          setResolvedPosition({ lat: position.lat(), lng: position.lng() });
        } else {
          setGeocodingError("לא הצלחנו לאתר את המיקום במפה. אפשר לפתוח אותו ב-Google Maps.");
        }
        setGeocoding(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [isLoaded, latitude, location, resolvedPosition]);

  useEffect(() => {
    if (!isLoaded || !hasCoordinates || !mapContainerRef.current || mapRef.current) return;

    const position = resolvedPosition;
    const map = new google.maps.Map(mapContainerRef.current, {
      center: position,
      zoom: 15,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      clickableIcons: false,
    });

    new google.maps.Marker({
      position,
      map,
      title: taskName,
    });

    mapRef.current = map;
  }, [hasCoordinates, isLoaded, resolvedPosition, taskName]);

  if (!hasCoordinates) {
    return (
      <div className="rounded-2xl border border-border/60 bg-muted/40 p-4 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <MapPin size={16} aria-hidden="true" />
          <span>{geocoding ? "מאתר את המקום במפה..." : geocodingError || "לא נמצא מיקום במפה."}</span>
        </div>
        <a
          href={googleMapsUrl(location)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-4 font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ExternalLink size={16} aria-hidden="true" />
          פתיחה ב-Google Maps
        </a>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl bg-muted px-4 text-center">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">טוען מפה...</p>
          {error && <p className="text-xs leading-relaxed text-destructive">{error}</p>}
        </div>
      </div>
    );
  }

  return <div ref={mapContainerRef} className="h-64 w-full rounded-2xl" aria-label={`מפה של ${location}`} />;
};

export default TaskLocationMap;

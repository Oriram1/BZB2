import { useState, useRef, useEffect, useMemo } from "react";
import TaskCard, { type Task } from "./TaskCard";
import { useGoogleMaps } from "./GoogleMapsProvider";
import GoogleMapsLoadState from "./GoogleMapsLoadState";
import { LocateFixed } from "lucide-react";

/** Marker as drawn in the redesign: a terracotta dot with a soft halo. */
const MARKER_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="14" fill="#E86E40" fill-opacity="0.35"/><circle cx="14" cy="14" r="7" fill="#E86E40"/></svg>',
)}`;

type MapViewProps = {
  tasks: Task[];
  saved?: Set<string>;
  onToggleSave?: (taskId: string) => void;
  origin: { lat: number; lng: number } | null;
  onRequestLocation: () => void;
};

const MapView = ({ tasks, saved, onToggleSave, origin, onRequestLocation }: MapViewProps) => {
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const selected = tasks.find((t) => t.id === selectedTask);
  const { isLoaded, error, retry } = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const pendingLocateRef = useRef(false);

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
      cameraControlOptions: { position: google.maps.ControlPosition.TOP_LEFT },
    });
  }, [center, isLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    located.forEach((task) => {
      const marker = new google.maps.Marker({
        position: { lat: task.lat, lng: task.lng },
        map,
        icon: {
          url: MARKER_ICON,
          scaledSize: new google.maps.Size(28, 28),
          anchor: new google.maps.Point(14, 14),
        },
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

  useEffect(() => {
    if (!origin || !pendingLocateRef.current || !mapRef.current) return;
    pendingLocateRef.current = false;
    mapRef.current.panTo(origin);
    mapRef.current.setZoom(14);
  }, [origin]);

  if (!isLoaded) {
    return <GoogleMapsLoadState error={error} retry={retry} className="rounded-lg overflow-hidden border border-border shadow-card h-[500px] flex items-center justify-center bg-muted px-4" />;
  }

  return (
    <div className="rounded-lg overflow-hidden border border-border shadow-card animate-fade-in relative">
      <div ref={containerRef} style={{ height: "max(420px, calc(100dvh - 256px))", width: "100%" }} />

      <button type="button" aria-label="התמקדות במיקום שלי"
        className="absolute bottom-4 right-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-card text-foreground shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          setSelectedTask(null);
          if (origin && mapRef.current) {
            mapRef.current.panTo(origin);
            mapRef.current.setZoom(14);
          } else {
            pendingLocateRef.current = true;
            onRequestLocation();
          }
        }}>
        <LocateFixed size={20} aria-hidden="true" />
      </button>

      {/* "Task Popup — Overlay" in the design is the list card itself. */}
      {selected && (
        <div className="absolute bottom-4 left-3 right-3 mx-auto max-w-[331px] animate-slide-up z-[1000]">
          <TaskCard
            task={selected}
            index={0}
            variant="popup"
            saved={selected.dbId !== undefined && Boolean(saved?.has(selected.dbId))}
            onToggleSave={onToggleSave}
          />
        </div>
      )}
    </div>
  );
};

export default MapView;

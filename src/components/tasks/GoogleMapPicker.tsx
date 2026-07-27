import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Navigation } from "lucide-react";
import { useGoogleMaps } from "./GoogleMapsProvider";

const defaultCenter = { lat: 32.08, lng: 34.78 };

interface GoogleMapPickerProps {
  lat: number | null;
  lng: number | null;
  onLocationSelect: (lat: number, lng: number) => void;
  onAddressFound?: (address: string) => void;
}

const GoogleMapPicker = ({ lat, lng, onLocationSelect, onAddressFound }: GoogleMapPickerProps) => {
  const { isLoaded, error } = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [locating, setLocating] = useState(false);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  const center = lat && lng ? { lat, lng } : defaultCenter;

  const reverseGeocode = useCallback((latitude: number, longitude: number) => {
    if (!onAddressFound) return;
    if (!geocoderRef.current) {
      if (!window.google) return;
      geocoderRef.current = new google.maps.Geocoder();
    }
    geocoderRef.current.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        onAddressFound(results[0].formatted_address);
      }
    });
  }, [onAddressFound]);

  useEffect(() => {
    if (!isLoaded || !containerRef.current || mapRef.current) return;

    const map = new google.maps.Map(containerRef.current, {
      center,
      zoom: 13,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    });

    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        const clat = e.latLng.lat();
        const clng = e.latLng.lng();
        onLocationSelect(clat, clng);
        reverseGeocode(clat, clng);
      }
    });

    mapRef.current = map;
  }, [isLoaded]);

  // Update marker when lat/lng changes
  useEffect(() => {
    if (!mapRef.current) return;
    if (markerRef.current) {
      markerRef.current.setMap(null);
    }
    if (lat && lng) {
      markerRef.current = new google.maps.Marker({
        position: { lat, lng },
        map: mapRef.current,
      });
      mapRef.current.panTo({ lat, lng });
    }
  }, [lat, lng]);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert("הדפדפן שלך לא תומך באיתור מיקום");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        onLocationSelect(latitude, longitude);
        reverseGeocode(latitude, longitude);
        setLocating(false);
      },
      () => {
        alert("לא ניתן לאתר את המיקום שלך");
        setLocating(false);
      }
    );
  };

  if (!isLoaded) {
    return (
      <div className="h-[250px] rounded-2xl bg-muted flex items-center justify-center text-center px-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">טוען מפה...</p>
          {error && <p className="text-xs text-destructive leading-relaxed">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} style={{ width: "100%", height: "250px", borderRadius: "1rem" }} />

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleUseMyLocation}
        disabled={locating}
        className="rounded-full self-start font-bold gap-2"
      >
        <Navigation size={16} />
        {locating ? "מאתר..." : "השתמש במיקום שלי"}
      </Button>

      {lat && lng && (
        <p className="text-xs text-muted-foreground">
          נ.צ: {lat.toFixed(5)}, {lng.toFixed(5)}
        </p>
      )}
    </div>
  );
};

export default GoogleMapPicker;

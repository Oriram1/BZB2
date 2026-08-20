import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Navigation } from "lucide-react";
import { useGoogleMaps } from "./GoogleMapsProvider";
import GoogleMapsLoadState from "./GoogleMapsLoadState";

const defaultCenter = { lat: 32.08, lng: 34.78 };

interface GoogleMapPickerProps {
  lat: number | null;
  lng: number | null;
  onLocationSelect: (lat: number, lng: number) => void;
  onAddressFound?: (address: string) => void;
}

const GoogleMapPicker = ({ lat, lng, onLocationSelect, onAddressFound }: GoogleMapPickerProps) => {
  const { isLoaded, error, retry } = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [locating, setLocating] = useState(false);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const onLocationSelectRef = useRef(onLocationSelect);
  const onAddressFoundRef = useRef(onAddressFound);

  const center = lat !== null && lng !== null ? { lat, lng } : defaultCenter;
  const initialCenterRef = useRef(center);
  onLocationSelectRef.current = onLocationSelect;
  onAddressFoundRef.current = onAddressFound;

  const reverseGeocode = useCallback((latitude: number, longitude: number) => {
    if (!onAddressFoundRef.current) return;
    if (!geocoderRef.current) {
      if (!window.google) return;
      geocoderRef.current = new google.maps.Geocoder();
    }
    geocoderRef.current.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        onAddressFoundRef.current?.(results[0].formatted_address);
      }
    });
  }, []);

  useEffect(() => {
    if (!isLoaded || !containerRef.current || mapRef.current) return;

    const map = new google.maps.Map(containerRef.current, {
      center: initialCenterRef.current,
      zoom: 13,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    });

    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        const clat = e.latLng.lat();
        const clng = e.latLng.lng();
        onLocationSelectRef.current(clat, clng);
        reverseGeocode(clat, clng);
      }
    });

    mapRef.current = map;
  }, [isLoaded, reverseGeocode]);

  // Update marker when lat/lng changes
  useEffect(() => {
    if (!mapRef.current) return;
    if (markerRef.current) {
      markerRef.current.setMap(null);
    }
    if (lat !== null && lng !== null) {
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
    return <GoogleMapsLoadState error={error} retry={retry} className="h-[250px] rounded-2xl bg-muted flex items-center justify-center px-4" />;
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} data-testid="google-map-picker" className="h-[250px] w-full rounded-2xl bg-muted" />

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

      {lat !== null && lng !== null && (
        <p className="text-xs text-muted-foreground">
          נ.צ: {lat.toFixed(5)}, {lng.toFixed(5)}
        </p>
      )}
    </div>
  );
};

export default GoogleMapPicker;

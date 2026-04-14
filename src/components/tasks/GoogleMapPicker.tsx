import { useState, useCallback } from "react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { Button } from "@/components/ui/button";
import { Navigation } from "lucide-react";
import { useGoogleMaps } from "./GoogleMapsProvider";

const containerStyle = {
  width: "100%",
  height: "250px",
  borderRadius: "1rem",
};

const defaultCenter = { lat: 32.08, lng: 34.78 };

interface GoogleMapPickerProps {
  lat: number | null;
  lng: number | null;
  onLocationSelect: (lat: number, lng: number) => void;
}

const GoogleMapPicker = ({ lat, lng, onLocationSelect }: GoogleMapPickerProps) => {
  const { isLoaded } = useGoogleMaps();
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [locating, setLocating] = useState(false);

  const center = lat && lng ? { lat, lng } : defaultCenter;

  const handleMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        onLocationSelect(e.latLng.lat(), e.latLng.lng());
      }
    },
    [onLocationSelect]
  );

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
        map?.panTo({ lat: latitude, lng: longitude });
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
      <div className="h-[250px] rounded-2xl bg-muted flex items-center justify-center">
        <p className="text-sm text-muted-foreground">טוען מפה...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={13}
        onClick={handleMapClick}
        onLoad={(m) => setMap(m)}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        }}
      >
        {lat && lng && <Marker position={{ lat, lng }} />}
      </GoogleMap>

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

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchTaskPlaces, type TaskPlace } from "@/lib/searchTaskPlaces";
import { useGoogleMaps } from "./GoogleMapsProvider";
import GoogleMapsLoadState from "./GoogleMapsLoadState";
import GoogleMapPicker from "./GoogleMapPicker";

export interface ConfirmedTaskLocation {
  query: string;
  formattedAddress: string;
  lat: number;
  lng: number;
}

interface Props {
  query: string;
  onConfirm: (location: ConfirmedTaskLocation) => void;
}

export default function AssistantLocation({ query, onConfirm }: Props) {
  const { isLoaded, error: mapError, retry } = useGoogleMaps();
  const [search, setSearch] = useState(query);
  const [request, setRequest] = useState({ query, attempt: 0 });
  const [places, setPlaces] = useState<TaskPlace[]>([]);
  const [selected, setSelected] = useState<TaskPlace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setSelected(null);
    setPlaces([]);
    void searchTaskPlaces(request.query).then((found) => {
      if (cancelled) return;
      setPlaces(found);
      if (found.length === 1) setSelected(found[0]);
    }).catch(() => {
      if (!cancelled) setError("חיפוש המקום לא הצליח. אפשר לנסות שוב או להזין כתובת מדויקת.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isLoaded, request]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4" aria-label="אישור מיקום המטלה">
      <h3 className="font-bold">איפה בדיוק נפגשים?</h3>
      <p className="mt-1 text-sm text-muted-foreground">בחרו את המקום המתאים. אם המטלה לידו, סמנו במפה את נקודת המפגש.</p>
      <form className="my-3 flex gap-2" onSubmit={(event) => {
        event.preventDefault();
        if (search.trim()) setRequest((current) => ({ query: search.trim(), attempt: current.attempt + 1 }));
      }}>
        <Input aria-label="חיפוש כתובת או מקום" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder="שם מקום ועיר, או רחוב ומספר" className="min-w-0" />
        <Button type="submit" variant="outline" disabled={loading || !search.trim()}>חיפוש</Button>
      </form>
      {!isLoaded ? <GoogleMapsLoadState error={mapError} retry={retry} className="p-4" /> : (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {loading ? "מחפש את המקום…" : error || (places.length === 0 ? "לא נמצא מקום מתאים. נסו שם מקום ועיר או כתובת מדויקת." : "תוצאות מ-Google Maps")}
          </p>
          <div className="my-3 flex flex-col gap-2" role="group" aria-label="מקומות שנמצאו">
            {places.map((place, index) => (
              <Button key={index} type="button" variant="outline" aria-pressed={selected === place}
                className="h-auto min-h-11 justify-start whitespace-normal py-2 text-start"
                onClick={() => setSelected(place)}>
                <span><span className="block font-bold">{place.name}</span><span className="block text-xs">{place.formattedAddress}</span></span>
              </Button>
            ))}
          </div>
          {!loading && (
            <GoogleMapPicker lat={selected?.lat ?? null} lng={selected?.lng ?? null}
              onLocationSelect={(lat, lng) => setSelected({
                lat, lng, precise: true, name: "נקודת המפגש שסומנה",
                formattedAddress: selected?.formattedAddress || search.trim(),
              })} />
          )}
          {selected && !selected.precise && <p className="mt-2 text-sm">זהו אזור כללי. הזינו כתובת מדויקת או סמנו את נקודת המפגש במפה.</p>}
          <Button type="button" className="mt-3 w-full" disabled={loading || !selected?.precise}
            onClick={() => { if (selected?.precise) onConfirm({ query, formattedAddress: selected.formattedAddress, lat: selected.lat, lng: selected.lng }); }}>
            אישור נקודת המפגש
          </Button>
        </>
      )}
    </div>
  );
}

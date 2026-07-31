import { MapPin } from "lucide-react";

const AddressMapPreview = ({ lat, lng, label }: { lat: number; lng: number; label: string }) => {
  const delta = 0.008;
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - delta}%2C${lat - delta}%2C${lng + delta}%2C${lat + delta}&layer=mapnik&marker=${lat}%2C${lng}`;
  return <div className="overflow-hidden rounded-2xl border border-border/60 bg-muted shadow-sm">
    <iframe title={`מפה של ${label}`} src={mapUrl} className="h-64 w-full border-0" loading="lazy" />
    <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center gap-2 px-4 py-2 text-sm font-bold hover:bg-muted">
      <MapPin size={16} aria-hidden="true" /> פתיחת המפה
    </a>
  </div>;
};

export default AddressMapPreview;

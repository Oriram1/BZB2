import { Button } from "@/components/ui/button";

type GoogleMapsLoadStateProps = {
  error: string | null;
  retry: () => void;
  className: string;
};

const GoogleMapsLoadState = ({ error, retry, className }: GoogleMapsLoadStateProps) => (
  <div className={className} role={error ? "alert" : "status"}>
    <div className="space-y-3 text-center">
      <p className="text-sm text-muted-foreground">{error || "טוען מפה..."}</p>
      {error && (
        <Button type="button" variant="outline" size="sm" onClick={retry} className="rounded-full font-bold">
          נסו שוב
        </Button>
      )}
    </div>
  </div>
);

export default GoogleMapsLoadState;

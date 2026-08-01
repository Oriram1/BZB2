import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceNoteBubbleProps {
  /** Signed URL; undefined while it is still being minted. */
  src?: string;
  /** Seconds recorded, stored with the message so the bubble sizes before load. */
  duration?: number | null;
  /** Outgoing bubbles are honey-coloured, so their controls need light ink. */
  outgoing: boolean;
}

const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/**
 * A voice note as WhatsApp draws it: one round play button, a scrubbable bar
 * and a running time. The native <audio> player is used underneath but hidden —
 * its chrome is a different size and colour in every browser, which looked
 * broken inside a coloured bubble.
 */
export function VoiceNoteBubble({ src, duration, outgoing }: VoiceNoteBubbleProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [total, setTotal] = useState(duration ?? 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setPosition(audio.currentTime);
    const onLoaded = () => {
      // A webm blob recorded in the browser often reports Infinity here, so the
      // duration measured while recording stays the more trustworthy number.
      if (Number.isFinite(audio.duration) && audio.duration > 0) setTotal(audio.duration);
    };
    const onEnded = () => {
      setPlaying(false);
      setPosition(0);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnded);
    };
  }, [src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play();
      setPlaying(true);
    }
  };

  const seek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || !total) return;
    const next = (Number(event.target.value) / 100) * total;
    audio.currentTime = next;
    setPosition(next);
  };

  const progress = total > 0 ? Math.min(100, (position / total) * 100) : 0;

  return (
    <div className="flex w-52 max-w-full items-center gap-2.5 py-0.5">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />

      <button
        type="button"
        onClick={toggle}
        disabled={!src}
        aria-label={playing ? "השהיית ההודעה הקולית" : "השמעת ההודעה הקולית"}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
          outgoing
            ? "bg-primary-foreground/25 text-primary-foreground hover:bg-primary-foreground/35"
            : "bg-primary/15 text-primary-ink hover:bg-primary/25",
          !src && "opacity-60",
        )}
      >
        {!src ? <Loader2 size={16} className="animate-spin" /> : playing ? <Pause size={16} /> : <Play size={16} />}
      </button>

      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={100}
          value={progress}
          onChange={seek}
          disabled={!src || !total}
          aria-label="מיקום בהודעה הקולית"
          dir="ltr"
          className={cn(
            "h-1 w-full cursor-pointer appearance-none rounded-full",
            "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3",
            "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none",
            outgoing
              ? "bg-primary-foreground/30 [&::-webkit-slider-thumb]:bg-primary-foreground [&::-moz-range-thumb]:bg-primary-foreground"
              : "bg-primary/20 [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:bg-primary",
          )}
        />
        <p
          className={cn(
            "mt-1 text-[10px] tabular-nums",
            outgoing ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
          dir="ltr"
        >
          {formatTime(playing || position > 0 ? position : total)}
        </p>
      </div>
    </div>
  );
}

export default VoiceNoteBubble;

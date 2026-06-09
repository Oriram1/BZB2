import bzbLogo from "@/assets/bzb-logo.png";
import { cn } from "@/lib/utils";

interface BzbLogoProps {
  className?: string;
  animate?: boolean;
}

const BzbLogo = ({ className, animate }: BzbLogoProps) => {
  return (
    <div
      className={cn("bg-primary/10 flex items-center justify-center", animate && "hover:animate-buzz transition-transform", className)}
      style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
    >
      <img src={bzbLogo} alt="BZB" className="w-[85%] h-[85%] object-contain" style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }} />
    </div>
  );
};

export default BzbLogo;

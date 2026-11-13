import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import BzbLogo from "@/components/BzbLogo";
import beeMark from "@/assets/bee-mark.svg";
import { Button } from "@/components/ui/button";
import { NavDrawerTrigger } from "@/components/MobileNav";
import { useRegisterHeader } from "@/components/NavDrawerContext";
import { HOME_PATH, ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface PageHeaderProps {
  title?: string;
  /**
   * Render `title` as the page's `<h1>`. Off by default because most screens
   * already carry their own heading in the body; turning it on there would
   * give the page two competing level-one headings.
   */
  titleIsPageHeading?: boolean;
  /** Page-specific call to action. Hidden on mobile — the bottom bar covers navigation there. */
  action?: ReactNode;
  icon?: ReactNode;
  showBack?: boolean;
  className?: string;
  /** "figma": the header as drawn in the redesign file. Only for screens that exist there. */
  variant?: "default" | "figma";
  /** figma only: back button at the inline start, title centred, menu at the end (as on "My Applications"). */
  centerTitle?: boolean;
}

/**
 * The single app header. Replaces six near-identical copies that had drifted apart.
 *
 * RTL layout: back button at the inline start (right in Hebrew) and pointing
 * right, logo next to it, page action at the inline end (left). Navigation
 * links are deliberately absent — on mobile they live in the bottom bar and on
 * desktop in the side drawer, so repeating them here created two competing menus.
 */
export function PageHeader({
  title,
  titleIsPageHeading = false,
  action,
  icon,
  showBack = true,
  className,
  variant = "default",
  centerTitle = false,
}: PageHeaderProps) {
  const TitleTag = titleIsPageHeading ? "h1" : "span";
  const navigate = useNavigate();
  const { user } = useAuth();
  useRegisterHeader();

  // Landing directly on a deep link leaves no history to go back to, which would
  // bounce the user out of the app. Fall back to the home screen instead.
  const goBack = () => (window.history.length > 2 ? navigate(-1) : navigate("/"));

  if (variant === "figma" && centerTitle) {
    return (
      <header className={cn("relative bg-card border-b border-border py-3 pe-[15px] ps-[26px] sticky top-0 z-30", className)}>
        <div className="max-w-5xl mx-auto grid grid-cols-[auto_1fr_auto] items-center gap-2">
          {showBack ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={goBack}
              aria-label="חזרה למסך הקודם"
              className="rounded-full bg-muted border border-border text-foreground hover:bg-secondary shrink-0 h-9 w-9"
            >
              <ArrowRight size={18} />
            </Button>
          ) : <span className="w-9" />}
          <TitleTag className="text-center ps-4 font-semibold text-foreground text-base truncate">{title}</TitleTag>
          <div className="flex items-center gap-2">
            {action && <div className="hidden md:block shrink-0">{action}</div>}
            <NavDrawerTrigger className="text-foreground hover:bg-muted" />
          </div>
        </div>
      </header>
    );
  }

  if (variant === "figma") {
    return (
      <header
        className={cn(
          "relative bg-card border-b border-border py-3 px-4 sticky top-0 z-30",
          className,
        )}
      >
        {/* This row is a flex container inside dir="rtl", so DOM order IS the
            right-to-left order: the first child renders furthest right. Navigation
            controls therefore come first — inline-start is the right edge in Hebrew. */}
        <div className="max-w-5xl mx-auto flex items-center gap-2">
          <Link
            to={user ? HOME_PATH : ROUTES.home}
            aria-label="לדף הבית"
            className="flex items-center gap-2 shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
          >
            <img src={beeMark} alt="" aria-hidden="true" className="h-[30px] w-[26px]" />
            <span className="sr-only">BZB</span>
          </Link>

          {title && (
            <TitleTag className="flex items-center gap-1.5 font-semibold text-foreground text-base truncate">
              {icon}
              {title}
            </TitleTag>
          )}

          <div className="flex-1" />

          {/* Trailing edge (left in Hebrew) is for page actions, not navigation. */}
          {action && <div className="hidden md:block shrink-0">{action}</div>}
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={goBack}
              aria-label="חזרה למסך הקודם"
              className="rounded-full bg-muted border border-border text-foreground hover:bg-secondary shrink-0 h-11 w-11"
            >
              <ArrowRight size={20} />
            </Button>
          )}
          {/* As drawn: logo at the inline start, menu at the inline end. */}
          <NavDrawerTrigger className="text-foreground hover:bg-muted" />
        </div>
      </header>
    );
  }

  return (
    <header
      className={cn(
        "relative gradient-honey py-3 px-4 sticky top-0 z-30 shadow-md",
        showBack && "pl-[4.25rem]",
        className,
      )}
    >
      {/* This row is a flex container inside dir="rtl", so DOM order IS the
          right-to-left order: the first child renders furthest right. Navigation
          controls therefore come first — inline-start is the right edge in Hebrew. */}
      <div className="max-w-5xl mx-auto flex items-center gap-2">
        {/* Desktop navigation lives in the drawer; mobile uses the bottom bar. */}
        <NavDrawerTrigger />

        <Link
          to={user ? HOME_PATH : ROUTES.home}
          aria-label="לדף הבית"
          className="flex items-center gap-2 shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
        >
          <BzbLogo className="w-9 h-9" />
          <span className="font-bold text-primary-foreground text-lg">BZB</span>
        </Link>

        {title && (
          <TitleTag className="flex items-center gap-1.5 font-semibold text-primary-foreground/90 text-sm truncate">
            {icon}
            {title}
          </TitleTag>
        )}

        <div className="flex-1" />

        {/* Trailing edge (left in Hebrew) is for page actions, not navigation. */}
        {action && <div className="hidden md:block shrink-0">{action}</div>}
      </div>
      {showBack && (
        <div className="absolute left-4 top-1/2 z-40 -translate-y-1/2">
          <Button
            variant="ghost"
            size="icon"
            onClick={goBack}
            aria-label="חזרה למסך הקודם"
            className="rounded-full text-primary-foreground hover:bg-foreground/10 shrink-0 h-11 w-11"
          >
            <ArrowRight size={20} className="rotate-180" />
          </Button>
        </div>
      )}
    </header>
  );
}

export default PageHeader;

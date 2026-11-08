import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { allowPerformanceUrl, CONSENT_CHANGED, getStoredConsent } from "@/lib/performanceConsent";
import type { BeforeSendMiddleware } from "@vercel/speed-insights";

const SpeedInsights = lazy(() => import("@vercel/speed-insights/react").then((module) => ({ default: module.SpeedInsights })));

const beforeSend: BeforeSendMiddleware = (event) => {
  if (getStoredConsent() !== "all" || !allowPerformanceUrl(window.location.href, window.location.origin)
    || !allowPerformanceUrl(event.url, window.location.origin)) return null;
  const url = new URL(event.url, window.location.origin);
  return { ...event, url: url.pathname, route: url.pathname };
};

/** Opt-in deployment and visitor consent are both required before loading the SDK. */
export default function PerformanceInsights() {
  const location = useLocation();
  const [consent, setConsent] = useState(getStoredConsent);
  useEffect(() => {
    const refresh = () => setConsent(getStoredConsent());
    window.addEventListener(CONSENT_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CONSENT_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  if (import.meta.env.VITE_ENABLE_SPEED_INSIGHTS !== "true" || consent !== "all"
    || !allowPerformanceUrl(`${location.pathname}${location.search}${location.hash}`, window.location.origin)) return null;
  return <Suspense fallback={null}><SpeedInsights beforeSend={beforeSend} debug={false} softNavs={false} /></Suspense>;
}

import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigationType } from "react-router-dom";

import { DirectionProvider } from "@radix-ui/react-direction";

import { AuthProvider } from "@/contexts/AuthContext";
import { GoogleMapsProvider } from "@/components/tasks/GoogleMapsProvider";
import RoleGuard from "@/components/RoleGuard";
const Landing = lazy(() => import("./pages/Landing"));
const Auth = lazy(() => import("./pages/Auth"));
const Login = lazy(() => import("./pages/Login"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Register = lazy(() => import("./pages/Register"));
const CreateTask = lazy(() => import("./pages/CreateTask"));
const TaskList = lazy(() => import("./pages/TaskList"));
const MyTasks = lazy(() => import("./pages/MyTasks"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Subscription = lazy(() => import("./pages/Subscription"));
const BillingReturn = lazy(() => import("./pages/BillingReturn"));
const ParentalHub = lazy(() => import("./pages/ParentalHub"));
const Chat = lazy(() => import("./pages/Chat"));
const Profile = lazy(() => import("./pages/Profile"));
const PublicProfile = lazy(() => import("./pages/PublicProfile"));
const TaskDetail = lazy(() => import("./pages/TaskDetail"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Terms = lazy(() => import("./pages/Terms"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Admin = lazy(() => import("./pages/Admin"));
const Settings = lazy(() => import("./pages/Settings"));
const ParentReport = lazy(() => import("./pages/ParentReport"));
const ParentView = lazy(() => import("./pages/ParentView"));
import { MobileNav, FloatingNavTrigger } from "./components/MobileNav";
import { NavDrawerProvider } from "./components/NavDrawerContext";
import PresenceTracker from "./components/PresenceTracker";
import InstallPrompt from "./components/InstallPrompt";
import PushOnboarding from "./components/PushOnboarding";
import { PermissionPromptProvider } from "./components/PermissionPromptContext";
import CookieConsent from "./components/CookieConsent";
import PerformanceInsights from "./components/PerformanceInsights";

const queryClient = new QueryClient();

/**
 * WCAG 2.4.1: every screen repeats the nav drawer and the floating trigger, so
 * keyboard users need one jump straight to the screen's own content. `tabIndex`
 * of -1 lets the anchor move focus into the region without making it a tab stop.
 */
const RouteViewport = ({ children }: { children: ReactNode }) => (
  <main id="main" tabIndex={-1} className="[overflow-x:clip] focus:outline-none">
    {children}
  </main>
);

const SkipToContent = () => (
  <a
    href="#main"
    className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-[10000] focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:font-semibold focus:text-foreground focus:shadow-xl focus:ring-2 focus:ring-ring"
  >
    דילוג לתוכן הראשי
  </a>
);

/**
 * A new screen starts at the top.
 *
 * The browser keeps the window scroll across a client-side navigation, so
 * tapping a card halfway down the task list used to drop you halfway down the
 * next screen. Back and forward are left alone on purpose: the browser restores
 * their scroll position, and returning to a list at the spot you left it is
 * exactly what people expect.
 */
const ScrollToTop = () => {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") return;
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash, navigationType]);

  return null;
};

/**
 * Every Radix primitive (Tabs, Select, DropdownMenu, Slider, ScrollArea…)
 * defaults to `dir="ltr"` and stamps it on its own root element, which flips
 * the whole subtree back to LTR no matter what `<html dir="rtl">` says. The
 * provider is the single place that tells all of them we are an RTL app.
 */
const App = () => (
  <DirectionProvider dir="rtl">
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <GoogleMapsProvider>
        <TooltipProvider>
          <Sonner />
          <BrowserRouter>
          <NavDrawerProvider>
          <PermissionPromptProvider>
            <ScrollToTop />
            <SkipToContent />
            <MobileNav />
            <PresenceTracker />
            <RouteViewport>
              <Suspense fallback={<div role="status" aria-label="העמוד נטען" className="mx-auto max-w-5xl space-y-4 p-6"><div className="h-10 w-1/2 animate-pulse rounded bg-muted" /><div className="h-48 animate-pulse rounded bg-muted" /><div className="h-32 animate-pulse rounded bg-muted" /></div>} >
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/login" element={<Login />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/register/:role" element={<Register />} />
                <Route path="/create-task" element={<RoleGuard allowedRoles={["tasker"]}><CreateTask /></RoleGuard>} />
                <Route path="/tasks" element={<TaskList />} />
                <Route path="/task/:id" element={<TaskDetail />} />
                <Route path="/my-tasks" element={<RoleGuard allowedRoles={["tasker", "bee"]}><MyTasks /></RoleGuard>} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/subscription" element={<RoleGuard allowedRoles={["tasker"]}><Subscription /></RoleGuard>} />
                <Route path="/billing/return" element={<RoleGuard allowedRoles={["tasker"]}><BillingReturn /></RoleGuard>} />
                <Route path="/parent" element={<RoleGuard allowedRoles={["parent"]}><ParentalHub /></RoleGuard>} />
                <Route path="/parent/report/:date" element={<RoleGuard allowedRoles={["parent"]}><ParentReport /></RoleGuard>} />
                <Route path="/parent/view/:token" element={<ParentView />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/chat" element={<RoleGuard allowedRoles={["tasker", "bee"]}><Chat /></RoleGuard>} />
                <Route path="/profile" element={<RoleGuard allowedRoles={["tasker", "bee"]}><Profile /></RoleGuard>} />
                {/* Public profile of another user, linked from a task listing. Open to guests. */}
                <Route path="/profile/:userId" element={<PublicProfile />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
            </RouteViewport>
            <InstallPrompt />
            <PushOnboarding />
            <CookieConsent />
            <PerformanceInsights />
            <FloatingNavTrigger />
          </PermissionPromptProvider>
          </NavDrawerProvider>
          </BrowserRouter>
        </TooltipProvider>
      </GoogleMapsProvider>
    </AuthProvider>
  </QueryClientProvider>
  </DirectionProvider>
);

export default App;

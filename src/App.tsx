import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigationType } from "react-router-dom";

import { DirectionProvider } from "@radix-ui/react-direction";

import { AuthProvider } from "@/contexts/AuthContext";
import { GoogleMapsProvider } from "@/components/tasks/GoogleMapsProvider";
import RoleGuard from "@/components/RoleGuard";
import { queryClient } from "@/lib/queryClient";
import { ROUTE_ROLES, ROUTES } from "@/lib/routes";
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
const Help = lazy(() => import("./pages/Help"));
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

/** A page only the roles in `ROUTE_ROLES` may open. */
const guarded = (path: string, page: ReactNode) => (
  <Route path={path} element={<RoleGuard allowedRoles={ROUTE_ROLES[path]}>{page}</RoleGuard>} />
);

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
              <Route path={ROUTES.home} element={<Landing />} />
              <Route path={ROUTES.auth} element={<Auth />} />
              <Route path={ROUTES.login} element={<Login />} />
              <Route path={ROUTES.resetPassword} element={<ResetPassword />} />
              <Route path={ROUTES.authCallback} element={<AuthCallback />} />
              <Route path={ROUTES.register} element={<Register />} />
              {guarded(ROUTES.createTask, <CreateTask />)}
              <Route path={ROUTES.tasks} element={<TaskList />} />
              <Route path={ROUTES.task} element={<TaskDetail />} />
              {guarded(ROUTES.myTasks, <MyTasks />)}
              <Route path={ROUTES.pricing} element={<Pricing />} />
              {guarded(ROUTES.subscription, <Subscription />)}
              {guarded(ROUTES.billingReturn, <BillingReturn />)}
              {guarded(ROUTES.parent, <ParentalHub />)}
              {guarded(ROUTES.parentReport, <ParentReport />)}
              <Route path={ROUTES.parentView} element={<ParentView />} />
              <Route path={ROUTES.settings} element={<Settings />} />
              {guarded(ROUTES.chat, <Chat />)}
              {guarded(ROUTES.profile, <Profile />)}
              {/* Public profile of another user, linked from a task listing. Open to guests. */}
              <Route path={ROUTES.publicProfile} element={<PublicProfile />} />
              <Route path={ROUTES.privacy} element={<PrivacyPolicy />} />
              <Route path={ROUTES.terms} element={<Terms />} />
              <Route path={ROUTES.help} element={<Help />} />
              <Route path={ROUTES.admin} element={<Admin />} />
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
      </GoogleMapsProvider>
    </AuthProvider>
  </QueryClientProvider>
  </DirectionProvider>
);

export default App;

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigationType } from "react-router-dom";

import { AuthProvider } from "@/contexts/AuthContext";
import { GoogleMapsProvider } from "@/components/tasks/GoogleMapsProvider";
import RoleGuard from "@/components/RoleGuard";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import AuthCallback from "./pages/AuthCallback";
import Register from "./pages/Register";
import CreateTask from "./pages/CreateTask";
import TaskList from "./pages/TaskList";
import MyTasks from "./pages/MyTasks";
import Pricing from "./pages/Pricing";
import ParentalHub from "./pages/ParentalHub";
import Chat from "./pages/Chat";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import TaskDetail from "./pages/TaskDetail";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin";
import Settings from "./pages/Settings";
import ParentReport from "./pages/ParentReport";
import { MobileNav, FloatingNavTrigger } from "./components/MobileNav";
import { NavDrawerProvider } from "./components/NavDrawerContext";
import PresenceTracker from "./components/PresenceTracker";
import InstallPrompt from "./components/InstallPrompt";

const queryClient = new QueryClient();

const RouteViewport = ({ children }: { children: ReactNode }) => (
  <div>{children}</div>
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
    // An anchor link asked for a specific place on the page; honour it.
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash, navigationType]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <GoogleMapsProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <NavDrawerProvider>
            <ScrollToTop />
            <MobileNav />
            <PresenceTracker />
            <RouteViewport>
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
                <Route path="/parent" element={<RoleGuard allowedRoles={["parent"]}><ParentalHub /></RoleGuard>} />
                <Route path="/parent/report/:date" element={<RoleGuard allowedRoles={["parent"]}><ParentReport /></RoleGuard>} />
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
            </RouteViewport>
            <InstallPrompt />
            <FloatingNavTrigger />
          </NavDrawerProvider>
          </BrowserRouter>
        </TooltipProvider>
      </GoogleMapsProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

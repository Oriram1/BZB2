import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { GoogleMapsProvider } from "@/components/tasks/GoogleMapsProvider";
import RoleGuard from "@/components/RoleGuard";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Login from "./pages/Login";
import Register from "./pages/Register";
import CreateTask from "./pages/CreateTask";
import TaskList from "./pages/TaskList";
import MyTasks from "./pages/MyTasks";
import Pricing from "./pages/Pricing";
import ParentalHub from "./pages/ParentalHub";
import Chat from "./pages/Chat";
import Profile from "./pages/Profile";
import TaskDetail from "./pages/TaskDetail";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin";
import { MobileNav, FloatingNavTrigger } from "./components/MobileNav";
import { BottomNav } from "./components/BottomNav";
import { NavDrawerProvider } from "./components/NavDrawerContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <GoogleMapsProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
          <NavDrawerProvider>
            <MobileNav />
            <div className="pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register/:role" element={<Register />} />
                <Route path="/create-task" element={<RoleGuard allowedRoles={["tasker"]}><CreateTask /></RoleGuard>} />
                <Route path="/tasks" element={<TaskList />} />
                <Route path="/task/:id" element={<TaskDetail />} />
                <Route path="/my-tasks" element={<RoleGuard allowedRoles={["tasker"]}><MyTasks /></RoleGuard>} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/parent" element={<RoleGuard allowedRoles={["parent"]}><ParentalHub /></RoleGuard>} />
                <Route path="/chat" element={<RoleGuard allowedRoles={["tasker", "bee"]}><Chat /></RoleGuard>} />
                <Route path="/profile" element={<RoleGuard allowedRoles={["tasker", "bee"]}><Profile /></RoleGuard>} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
            <BottomNav />
            <FloatingNavTrigger />
          </NavDrawerProvider>
          </BrowserRouter>
        </TooltipProvider>
      </GoogleMapsProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

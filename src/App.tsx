import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
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
import { MobileNav } from "./components/MobileNav";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <MobileNav />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register/:role" element={<Register />} />
            <Route path="/create-task" element={<CreateTask />} />
            <Route path="/tasks" element={<TaskList />} />
            <Route path="/task/:id" element={<TaskDetail />} />
            <Route path="/my-tasks" element={<MyTasks />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/parent" element={<ParentalHub />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

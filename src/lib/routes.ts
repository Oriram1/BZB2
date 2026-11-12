import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const ROUTES = {
  home: "/",
  auth: "/auth",
  login: "/login",
  resetPassword: "/reset-password",
  authCallback: "/auth/callback",
  register: "/register/:role",
  createTask: "/create-task",
  tasks: "/tasks",
  task: "/task/:id",
  myTasks: "/my-tasks",
  myPublishedTasks: "/my-tasks?tab=published",
  pricing: "/pricing",
  subscription: "/subscription",
  billingReturn: "/billing/return",
  parentView: "/parent/view/:token",
  settings: "/settings",
  chat: "/chat",
  profile: "/profile",
  publicProfile: "/profile/:userId",
  privacy: "/privacy",
  terms: "/terms",
  help: "/help",
  admin: "/admin",
} as const;

/** Every role starts on the task board; role-specific screens are one tap away in the nav. */
export const HOME_PATH = ROUTES.tasks;

/** Where a signed-in person lands to finish a task form that was waiting for a saved card. */
export const CREATE_TASK_RESUME_PATH = `${ROUTES.createTask}?resume=1`;

export const registerPath = (role: string) => `/register/${role}`;

const TASKER: AppRole[] = ["tasker"];
const TASKER_OR_BEE: AppRole[] = ["tasker", "bee"];

/** Routes only some roles may open: App.tsx guards them with these, and the nav menus list them to the same roles. */
export const ROUTE_ROLES: Record<string, AppRole[]> = {
  [ROUTES.createTask]: TASKER,
  [ROUTES.myTasks]: TASKER_OR_BEE,
  [ROUTES.subscription]: TASKER,
  [ROUTES.billingReturn]: TASKER,
  [ROUTES.chat]: TASKER_OR_BEE,
  [ROUTES.profile]: TASKER_OR_BEE,
};

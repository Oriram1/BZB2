import { handleTaskScreen } from "./handler.ts";

Deno.serve((req) => handleTaskScreen(req));

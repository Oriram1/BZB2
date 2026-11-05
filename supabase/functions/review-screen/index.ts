import { handleReviewScreen } from "./handler.ts";

Deno.serve((req) => handleReviewScreen(req));

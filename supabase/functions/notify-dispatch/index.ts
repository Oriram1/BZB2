import { serveCron } from "../_shared/auth.ts";
import { dispatchNotification } from "./handler.ts";

serveCron(dispatchNotification);

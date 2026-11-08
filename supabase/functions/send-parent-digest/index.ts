import { serveCron } from "../_shared/auth.ts";
import { sendParentDigests } from "./handler.ts";

serveCron(sendParentDigests);

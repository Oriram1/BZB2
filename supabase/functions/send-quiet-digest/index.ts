import { serveCron } from "../_shared/auth.ts";
import { sendQuietDigests } from "./handler.ts";

serveCron(sendQuietDigests);

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerServiceWorker } from "./lib/push";

createRoot(document.getElementById("root")!).render(<App />);

// Registered after load: the worker only handles push, so nothing on screen
// waits on it.
window.addEventListener("load", () => {
  registerServiceWorker();
});

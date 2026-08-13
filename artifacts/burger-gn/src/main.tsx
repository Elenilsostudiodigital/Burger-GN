import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerBurgerGnPwa } from "./pwa/registerPwa";
import { PwaInstallPrompt } from "./pwa/PwaInstallPrompt";

registerBurgerGnPwa();

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <PwaInstallPrompt />
  </>,
);

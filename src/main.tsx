import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CaptureOverlay } from "./components/CaptureOverlay";
import { PreviewBar } from "./components/PreviewBar";
import { Settings } from "./components/Settings";
import { Toast } from "./components/Toast";
import { isTauri, windowLabel } from "./lib/tauri";
import "./styles/global.css";

// One bundle serves every window; the window label selects the view.
const label = windowLabel();
const view = label.startsWith("overlay-") ? (
  <CaptureOverlay />
) : label === "toast" ? (
  <Toast />
) : (
  <Settings />
);
const root = document.documentElement;
root.classList.add(label === "settings" ? "settings" : "transparent");
if (!isTauri) root.classList.add("preview");

// biome-ignore lint/style/noNonNullAssertion: the root element is defined in index.html
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {!isTauri && <PreviewBar current={label} />}
    {view}
  </StrictMode>,
);

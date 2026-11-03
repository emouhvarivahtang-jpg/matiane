import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";

// Keep the old HTTP origin and incoming transfer popups connected to the studio.
// The public homepage loads independently of the editor and its dependencies.
const parameters = new URLSearchParams(location.search);
const studio =
  /^\/studio(?:\/|$)/.test(location.pathname) ||
  parameters.has("transfer") ||
  parameters.has("auth") ||
  location.origin === "http://57.129.177.67";
document.documentElement.dataset.surface = studio ? "studio" : "landing";
const landingVersion = /^\/landing-archive(?:\/|$)/.test(location.pathname)
  ? "archive"
  : /^\/landing-v2(?:\/|$)/.test(location.pathname)
    ? "v2"
    : "v2";
if (!studio) document.documentElement.dataset.landingVersion = landingVersion;
// Separate loader callbacks are essential: Vite 6 attaches the wrong CSS
// dependency list to a conditional import inside a single lazy callback.
const Studio = lazy(() => import("./main.jsx"));
const Landing = lazy(() => import("./landing.jsx"));
const LandingV2 = lazy(() => import("./landing-v2.jsx"));
const LandingArchive = lazy(() => import("./landing-archive.jsx"));
const Screen = studio
  ? Studio
  : landingVersion === "archive"
    ? LandingArchive
    : landingVersion === "v2"
      ? LandingV2
      : Landing;

createRoot(document.getElementById("root")).render(
  <Suspense
    fallback={
      <div
        style={{
          padding: "32px",
          color: "#324c3c",
          background: "#faf8f2",
          fontFamily: "sans-serif",
        }}
        role="status"
      >
        Matiane · მატიანე
      </div>
    }
  >
    <Screen />
  </Suspense>,
);

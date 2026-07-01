// Opsette Share — per-app configuration for SmartFlow.
// See ../../../_shared/opsette-share/INTEGRATION.md.

import type { OpsetteShareConfig } from "./config.template";

export type { OpsetteShareConfig };

export const opsetteShareConfig: OpsetteShareConfig = {
  appName: "SmartFlow",
  tagline: "Turn a list of process steps into a clean swimlane diagram, then export to share.",
  url: "https://tools.opsette.io/smart-flow/",
  logoSrc: "opsette-logo.png",
};

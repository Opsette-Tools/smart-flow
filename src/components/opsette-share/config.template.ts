// Opsette Share — per-app configuration template.
// Copy this to `src/components/opsette-share/config.ts` and fill in the four fields.
//
// `logoSrc` is a filename relative to /public; the component resolves it through
// Vite's BASE_URL so it works in both dev (/) and prod (/<app>/).

export type OpsetteShareConfig = {
  appName: string;
  tagline: string;
  url: string;
  logoSrc?: string;
};

export const opsetteShareConfig: OpsetteShareConfig = {
  appName: "REPLACE_ME",
  tagline: "REPLACE_ME — short one-liner shown in the share modal.",
  url: "https://tools.opsette.io/REPLACE_ME/",
  logoSrc: "opsette-logo.png",
};

import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Language is Norwegian; configure once here so <html lang="nb"> is consistent.
  // (App Router handles this via <html> in app/layout.tsx rather than i18n config.)
};

export default config;

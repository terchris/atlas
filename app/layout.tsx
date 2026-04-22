import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas — Norges frivillige sektor",
  description:
    "Atlas er et portal til den norske frivillige sektoren — organisasjoner, aktiviteter og humanitære behov i hver kommune.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}

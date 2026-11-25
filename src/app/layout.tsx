import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Casino Portal | Phase 1",
  description: "Secure player account access."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

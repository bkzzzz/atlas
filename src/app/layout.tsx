import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas — Game Asset Studio",
  description:
    "Direct a reference, style, and camera view into a production-ready 2D game asset.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0b0c0f",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

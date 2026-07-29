import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas — AI Game Asset Workspace",
  description:
    "A persistent canvas for generating, arranging, and editing game assets.",
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

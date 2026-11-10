import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geist = localFont({ src: "./fonts/GeistVF.woff", variable: "--font-geist", display: "swap" });
const geistMono = localFont({ src: "./fonts/GeistMonoVF.woff", variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "The Number — a clearer picture of your business",
  description: "Import your transactions, review what belongs to your business, and leave with clear records. Explore an explainable federal tax estimate with the sample workspace.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111512" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

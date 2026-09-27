import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const basePath = process.env.SITE_BASE_PATH ?? "";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "AU Campus Court",
  description: "Find and reserve Assumption University sports facilities.",
  icons: {
    icon: `${basePath}/favicon.svg`,
    shortcut: `${basePath}/favicon.svg`,
  },
  openGraph: {
    title: "AU Campus Court",
    description: "Find a court. Book your time. Play.",
    images: [{ url: `${basePath}/og.png`, width: 1672, height: 941, alt: "AU Campus Court" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AU Campus Court",
    description: "Find a court. Book your time. Play.",
    images: [`${basePath}/og.png`],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}

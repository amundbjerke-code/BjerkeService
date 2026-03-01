import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";

import { TopBar } from "@/components/top-bar";

import "./globals.css";

const appFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-app"
});

export const metadata: Metadata = {
  title: "Bjerke Service App",
  description: "Mobil-first prosjektstyring for Bjerke Service"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nb">
      <body className={`${appFont.variable} min-h-screen`}>
        <TopBar />
        <main className="pb-12 pt-6">{children}</main>
      </body>
    </html>
  );
}



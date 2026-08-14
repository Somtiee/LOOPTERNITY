import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { Orbitron, Space_Grotesk } from "next/font/google";
import { Web3Providers } from "@/web3/Web3Providers";
import { wagmiConfig } from "@/web3/config";
import "./globals.css";

const display = Orbitron({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const sans = Space_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "LOOPTERNITY",
  description: "Vertical endless survival. Climb forever. Don't get caught.",
  applicationName: "LOOPTERNITY",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#05070f",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookie = (await headers()).get("cookie") ?? undefined;
  const initialState = cookieToInitialState(wagmiConfig, cookie);

  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full`}>
      <body className="min-h-dvh overflow-hidden bg-[#05070f] font-sans text-slate-100 antialiased">
        <Web3Providers initialState={initialState}>{children}</Web3Providers>
      </body>
    </html>
  );
}

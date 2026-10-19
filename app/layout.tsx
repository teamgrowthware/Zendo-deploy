import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist_Mono, Outfit, Syne } from "next/font/google";
import { SiteHeader } from "@/components/chrome";
import { MobileAppNav } from "@/components/mobile-app-nav";
import { ThemeToaster } from "@/components/theme";
import { notePublicRequest } from "@/lib/engine";
import { currentUser } from "@/lib/auth";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const syne = Syne({ subsets: ["latin"], variable: "--font-syne", weight: ["600", "700", "800"] });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0A0A0A",
};

export const metadata: Metadata = {
  title: { default: "Zendo L-1 Network", template: "%s · Zendo L-1 Network" },
  description: "Zendo L-1 Network is the zendo-1 chain: ZendoCoin gas, proof-of-stake blocks, and a bonding-curve launchpad. Wallets keep their own keys.",
  applicationName: "Zendo L-1 Network",
  icons: { icon: "/logo.svg", apple: "/logo.svg" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await notePublicRequest(await headers());
  const authenticated = Boolean(await currentUser());
  return (
    <html lang="en" className={`${outfit.variable} ${syne.variable} ${mono.variable} zendo-h-full zendo-antialiased`} data-theme="dark" suppressHydrationWarning>
      <body className="zendo-font-outfit zendo-flex zendo-min-h-full zendo-flex-col">
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var r=document.documentElement;var q=new URLSearchParams(location.search);var a=q.get("zendo_app")==="android"||localStorage.getItem("zendo-app-mode")==="android";if(q.get("zendo_app")==="android")localStorage.setItem("zendo-app-mode","android");if(a)r.dataset.zendoApp="android";var t=localStorage.getItem("zendo-theme");var f=localStorage.getItem("zendo-font");var c=localStorage.getItem("zendo-contrast");r.dataset.theme=t==="light"?"light":"dark";if(f==="112"||f==="125")r.dataset.font=f;if(c==="high")r.dataset.contrast="high";}catch(e){}`,
          }}
        />
        <SiteHeader />
        <div id="content" className="zendo-flex zendo-flex-1 zendo-flex-col">{children}</div>
        <MobileAppNav authenticated={authenticated} />
        <ThemeToaster />
      </body>
    </html>
  );
}

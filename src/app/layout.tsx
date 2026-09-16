import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { UserProvider } from "@/lib/UserContext";

export const viewport: Viewport = {
  themeColor: "#0b1329",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "P&P CONSTRUYE | Dashboard",
  description: "Sistema de gestión integral para construcción",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "P&P Construye",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <UserProvider>
          <AppShell>{children}</AppShell>
        </UserProvider>
      </body>
    </html>
  );
}

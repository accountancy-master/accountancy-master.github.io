import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DeviceSettingsProvider } from "@/app-state/DeviceSettings";
import { ProgressProvider } from "@/app-state/ProgressProvider";
import { ServiceWorker } from "@/app-state/ServiceWorker";
import { StoreProvider } from "@/app-state/StoreProvider";
import { THEME_SCRIPT } from "@/app-state/themeScript";
import { APP_DESCRIPTION } from "@/content/topicCourses";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Accountancy Master",
  description: APP_DESCRIPTION,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Same emerald as --color-primary in globals.css (a meta tag cannot read a CSS variable).
  themeColor: "#047857",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The theme script below sets data-theme on this element before React hydrates it.
      suppressHydrationWarning
    >
      <head>
        {/* The learner's colour theme, before anything is painted (app-state/theme.ts). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ServiceWorker />
        <DeviceSettingsProvider>
          <StoreProvider>
            <ProgressProvider>
              {children}
            </ProgressProvider>
          </StoreProvider>
        </DeviceSettingsProvider>
      </body>
    </html>
  );
}

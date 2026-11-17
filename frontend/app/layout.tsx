import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { LocaleProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Mealwise",
  description: "Personalized meal planning and calorie tracking",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}

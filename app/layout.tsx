import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { TopNav } from "@/components/layout/top-nav";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tracer — AI Customs Document Review",
  description: "AI copilot for customs document review — detect missing paperwork, compliance risks, and filing issues before submission",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} dark h-full antialiased`}
    >
      <body className="app-backdrop app-grid min-h-full text-foreground">
        <StoreProvider>
          <div className="relative flex min-h-screen flex-col">
            <TopNav />
            <main className="relative flex-1">
              {children}
            </main>
          </div>
        </StoreProvider>
      </body>
    </html>
  );
}

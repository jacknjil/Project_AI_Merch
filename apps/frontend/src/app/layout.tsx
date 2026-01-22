import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Merch Engine",
  description: "AI-powered merch studio.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

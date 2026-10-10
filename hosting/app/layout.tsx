import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hypothesis",
  description: "Predict fluid flow, falling balls, ring escapes, and mathematical simulations. Trade with free gold and explore science competitions.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

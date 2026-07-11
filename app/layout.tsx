import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "newinstitute",
  description: "Next.js + MongoDB starter with a self-contained auth system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

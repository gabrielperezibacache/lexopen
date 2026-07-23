import type { Metadata } from "next";
import { Fraunces, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LexOpen — Operaciones jurídicas open source",
  description:
    "Clon open-source de HighQ para estudios jurídicos en Chile. Causas, jurisprudencia, Obsidian, Hermes Agent y Google Workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${sora.variable} ${fraunces.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}

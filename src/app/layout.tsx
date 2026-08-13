import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Fraunces, Sora } from "next/font/google";
import { CsrfFetchPatch } from "@/components/CsrfFetchPatch";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { getDictionary } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const dict = getDictionary(locale);
  return {
    title: dict.meta.title,
    description: dict.meta.description,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Per-request CSP nonces require dynamic rendering (see Next.js CSP guide).
  await connection();
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body className={`${sora.variable} ${fraunces.variable} antialiased`}>
        <CsrfFetchPatch />
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}

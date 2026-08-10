import type { Metadata } from "next";
import { Fraunces, Sora } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { getDictionary } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

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
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className={`${sora.variable} ${fraunces.variable} antialiased`}>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}

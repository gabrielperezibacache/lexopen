import type { MetadataRoute } from "next";

/** PWA manifest (§6.15 / Next 16 metadata route). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LexOpen",
    short_name: "LexOpen",
    description:
      "Causas, fuentes y trabajo diario de profesionales y estudios jurídicos.",
    start_url: "/inicio",
    display: "standalone",
    background_color: "#0d1022",
    theme_color: "#0d1022",
    lang: "es-CL",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

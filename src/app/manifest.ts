import type { MetadataRoute } from "next";

/** PWA manifest (§6.15 / Next 16 metadata route). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LexOpen",
    short_name: "LexOpen",
    description:
      "Operaciones jurídicas para estudios chilenos — plazos, causas y equipo en el Host local.",
    start_url: "/inicio",
    display: "standalone",
    background_color: "#f7f4ef",
    theme_color: "#1f6f78",
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

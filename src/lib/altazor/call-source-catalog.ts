import type { WorkCountry } from "@/lib/config/countries";

export type CallSource = {
  id: string;
  country: WorkCountry;
  label: string;
  url: string;
  feedUrl?: string;
};

export const CALL_SOURCES: readonly CallSource[] = [
  {
    id: "anid-cl", country: "CL", label: "ANID · Concursos abiertos",
    url: "https://post.anid.gob.cl/frontend.php/es/postulacion/concurso",
  },
  {
    id: "aei-es", country: "ES", label: "Agencia Estatal de Investigación",
    url: "https://www.aei.gob.es/convocatorias/buscador-convocatorias",
  },
  {
    id: "ukri-gb", country: "GB", label: "UK Research and Innovation",
    url: "https://www.ukri.org/opportunity/",
    feedUrl: "https://www.ukri.org/opportunity/feed/",
  },
  {
    id: "nsf-us", country: "US", label: "NSF · Próximos plazos",
    url: "https://www.nsf.gov/funding/opportunities",
    feedUrl: "https://www.nsf.gov/rss/rss_www_funding-upcoming/rss.xml",
  },
];

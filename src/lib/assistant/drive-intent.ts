import type { AssistantIntent } from "./types";

/** Only a direct current request can enter the Host Drive workflow. */
export function explicitDriveIntent(text: string): AssistantIntent | undefined {
  const plain = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  if (!/\bdrive\b/.test(plain) || /^(?:[¿?]\s*)?(?:como|que significa|explica|cual|por que|se puede)\b/.test(plain)) return;
  if (/\b(?:y|luego|ademas)\s+(?:envia|publica|elimina|comparte|crea|guarda|sube|copia|revisa)\b/.test(plain)) return;
  const direct = plain.replace(/^[¿?]?\s*(?:por favor[,:]?\s*)?(?:(?:puedes|podrias)\s+|quiero que\s+|necesito que\s+)?/, "");
  const quoted = text.match(/["“]([^"”]{1,300})["”]/u)?.[1];
  if (/^(?:crea|crear|crees|prepara|prepares)\b/.test(direct) && /\bcarpeta\b/.test(direct)) return { toolId: "drive.crearCarpeta", confidence: 1, slots: quoted ? { nombre: quoted } : {} };
  if (/^(?:guarda|guardar|guardes|sube|subir|subas|copia|copiar|copies|envia|enviar|envies)\b/.test(direct) && /\b(?:documento|archivo|copia|version)\b|\.[a-z0-9]{2,8}\b/.test(direct)) {
    const named = quoted || text.match(/(?:guarda(?:r)?|sube|subir|copia(?:r)?|env[ií]a(?:r)?)\s+(?:(?:el|una?|este)\s+)?(?:(?:documento|archivo)\s+)?(.{1,300}?)\s+(?:en|a)\s+(?:mi\s+|el\s+|google\s+)?drive\b/iu)?.[1]?.trim();
    const literal = named && !/^(?:este|ese|el|este documento|ese documento|documento|archivo)$/iu.test(named) ? named : undefined;
    return { toolId: "drive.guardarDocumento", confidence: 1, slots: literal ? { documento: literal } : {} };
  }
  if (/^(?:revisa|revisar|comprueba|comprobar|muestra|mostrar|consulta|consultar|dime|estado|conexion|carpeta)\b/.test(direct) && /\b(?:estado|conexion|carpeta|conectado|conectada)\b/.test(direct)) return { toolId: "drive.estado", confidence: 1, slots: {} };
}

import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { EditorialMotion } from "./EditorialMotion";
import styles from "./EditorialHeading.module.css";
import ink from "./EditorialInk.module.css";

type Engraving = { src: string; width: number; height: number; plate?: boolean; framing?: { scale: number; x: number; y: number } };

const engravings = {
  academic: { src: "/editorial/generated/academico-gpt-v1.webp", width: 720, height: 405, framing: { scale: 1.001, x: .07, y: -3.33 } },
  calendar: { src: "/editorial/generated/agenda-gpt-v1.webp", width: 720, height: 405, framing: { scale: 1.034, x: -.97, y: .49 } },
  casefiles: { src: "/editorial/generated/expedientes-v2.webp", width: 720, height: 402, plate: true },
  clients: { src: "/editorial/generated/clientes-gpt-v1.webp", width: 720, height: 405, framing: { scale: 1.037, x: -.07, y: -1.85 } },
  billing: { src: "/editorial/generated/libro-contable-v1.webp", width: 720, height: 480 },
  tasks: { src: "/editorial/generated/tareas-gpt-v1.webp", width: 720, height: 405, framing: { scale: 1.145, x: .07, y: -.74 } },
  deadlines: { src: "/editorial/generated/plazos-flow-v1.webp", width: 720, height: 405, plate: true },
  correspondence: { src: "/editorial/generated/correspondencia-gpt-v1.webp", width: 720, height: 405, framing: { scale: 1.05, x: .07, y: 1.11 } },
  research: { src: "/editorial/generated/investigacion-flow-v1.webp", width: 720, height: 402, plate: true },
  writing: { src: "/editorial/generated/escritura-gpt-v1.webp", width: 720, height: 405, framing: { scale: 1.266, x: .14, y: -5.68 } },
  hearings: { src: "/editorial/generated/audiencias-gpt-v1.webp", width: 720, height: 405, framing: { scale: .986, x: .21, y: -.99 } },
  people: { src: "/editorial/generated/personas-gpt-v1.webp", width: 720, height: 405, framing: { scale: .978, x: .14, y: 1.36 } },
  workflows: { src: "/editorial/generated/flujos-gpt-v1.webp", width: 720, height: 405, framing: { scale: 1.011, x: .07, y: -.49 } },
  connections: { src: "/editorial/generated/conexiones-gpt-v1.webp", width: 720, height: 405, framing: { scale: 1.09, x: .21, y: -2.35 } },
  notifications: { src: "/editorial/generated/avisos-gpt-v1.webp", width: 720, height: 405, framing: { scale: .922, x: -.28, y: -.99 } },
  settings: { src: "/editorial/generated/configuracion-gpt-v1.webp", width: 720, height: 405, framing: { scale: 1.104, x: -.07, y: -4.44 } },
} satisfies Record<string, Engraving>;

const motionSources = {
  casefiles: "/editorial/generated/expedientes-flow-v2.mp4",
  billing: "/editorial/generated/libro-contable-flow-v1.mp4",
  deadlines: "/editorial/generated/plazos-flow-v1.mp4",
  research: "/editorial/generated/investigacion-motion-flow-v1.mp4",
};

const motionPosters = {
  casefiles: "/editorial/generated/expedientes-flow-v2-poster.webp",
  billing: "/editorial/generated/libro-contable-flow-v1-poster.webp",
  deadlines: "/editorial/generated/plazos-flow-v1-poster.webp",
  research: "/editorial/generated/investigacion-motion-flow-v1-poster.webp",
};

export type EditorialArtwork = keyof typeof engravings;

export function EditorialHeading({ artwork, context, children }: { artwork: EditorialArtwork; context?: "site"; children: ReactNode }) {
  const engraving: Engraving = engravings[artwork];
  const motion = artwork === "casefiles" || artwork === "billing" || artwork === "deadlines" || artwork === "research" ? artwork : null;
  const framing = engraving.framing;
  const frameStyle = framing ? {
    "--engraving-scale": framing.scale,
    "--engraving-x": `${framing.x}%`,
    "--engraving-y": `${framing.y}%`,
  } as CSSProperties : undefined;
  return (
    <div className={styles.heading} data-editorial-heading data-editorial-artwork={artwork} data-editorial-context={context}>
      <div className={styles.copy}>{children}</div>
      <div className={styles.artwork} data-editorial-media data-editorial-static={!motion || undefined} style={frameStyle}>
        {motion
        ? <EditorialMotion key={motion} stillSrc={motionPosters[motion]} subject={motion} motionSrc={motionSources[motion]} />
        : <Image src={engraving.src} width={engraving.width} height={engraving.height} alt="" aria-hidden="true" unoptimized className={`${styles.engraving}${engraving.plate ? ` ${ink.ink}` : ""}`} />}
      </div>
    </div>
  );
}

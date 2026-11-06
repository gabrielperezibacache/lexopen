import type { ReactNode } from "react";
import Image from "next/image";
import { FolioSymbol } from "./FolioSymbol";
import styles from "./EditorialHeading.module.css";

const engravings = {
  academic: { src: "/editorial/academico.webp", height: 224 },
  calendar: { src: "/editorial/agenda.webp", height: 231 },
};

export type EditorialArtwork = keyof typeof engravings | "tasks";

export function EditorialHeading({ artwork, children }: { artwork: EditorialArtwork; children: ReactNode }) {
  const engraving = artwork === "tasks" ? null : engravings[artwork];
  return (
    <div className={styles.heading} data-editorial-heading>
      <div className={styles.copy}>{children}</div>
      {engraving
        ? <Image src={engraving.src} width={360} height={engraving.height} alt="" aria-hidden="true" unoptimized className={styles.engraving} />
        : <FolioSymbol variant="evidence" className={styles.folio} />}
    </div>
  );
}

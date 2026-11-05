import type { SVGProps } from "react";
import Image from "next/image";

/** LexOpen's geometric folio family. Decorative; meaning stays in the adjacent text. */
export function FolioSymbol({ variant = "mark", ...props }: SVGProps<SVGSVGElement> & { variant?: "mark" | "collection" | "evidence" }) {
  if (variant === "mark") return <Image src="/icons/lexopen-reader-192.png" alt="" aria-hidden="true" width={192} height={192} unoptimized className={props.className} />;
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      {variant === "collection" ? <>
        <path d="M7 11h7v23H7zM17 7h7v27h-7zM27 12l6-1 4 22-6 1zM9 16h3M19 12h3M9 28h3M19 28h3" />
        <path d="M4 36h33" />
      </> : <>
        <path d="M10 5h15l6 6v23H10zM25 5v7h6M15 17h11M15 22h6" />
        <path d="m21 29 3 3 8-8M6 11v26h19" />
      </>}
    </svg>
  );
}

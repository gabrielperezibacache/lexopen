export type CommitteeDeliverableHref =
  | { kind: "external"; href: string }
  | { kind: "library"; bookId: string; fragmentOrdinal?: number }
  | { kind: "academic"; workspaceId: string; artifactId: string };

/** Parse links without visiting them or granting access to their destination. */
export function parseCommitteeDeliverableHref(value: string): CommitteeDeliverableHref | null {
  const library = /^\/biblioteca\/([A-Za-z0-9_-]{1,160})(?:\?fragment=([1-9]\d{0,15})#fragment-\2)?$/.exec(value);
  if (library) {
    const ordinal = library[2] ? Number(library[2]) : undefined;
    return ordinal !== undefined && !Number.isSafeInteger(ordinal) ? null
      : { kind: "library", bookId: library[1], ...(ordinal === undefined ? {} : { fragmentOrdinal: ordinal }) };
  }
  const academic = /^\/academico\?trabajo=([A-Za-z0-9_-]{1,100})&resultado=([A-Za-z0-9_-]{1,100})$/.exec(value);
  if (academic) return { kind: "academic", workspaceId: academic[1], artifactId: academic[2] };
  if (!/^https:\/\//i.test(value) || /[\s\p{Cc}\\<>]/u.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? { kind: "external", href: value } : null;
  } catch { return null; }
}

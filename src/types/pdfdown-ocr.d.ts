// The optional native package is absent on Windows. Keep only the API used by
// local-ocr typed there; importing it still requires the existing runtime guard.
declare module "@d0paminedriven/pdfdown-ocr" {
  export function extractTextWithOcrPerPageAsync(
    input: Buffer,
    options: { lang: string; minTextLength: number; maxThreads: number }
  ): Promise<Array<{ page: number; text: string; source: string }>>;
}

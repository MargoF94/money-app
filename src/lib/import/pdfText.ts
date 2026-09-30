// Turns a PDF into rows of text cells, using pdf.js (loaded only when a PDF is opened).
// Items at the same height form a row; cells are ordered left to right.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export async function pdfRows(data: ArrayBuffer): Promise<string[][]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  // Japanese statements need the character maps (only the Japanese ones are shipped, in public/cmaps).
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), cMapUrl: './cmaps/', cMapPacked: true }).promise;
  const out: string[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const rows: { y: number; items: { x: number; s: string }[] }[] = [];
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
      if (!row) rows.push((row = { y, items: [] }));
      row.items.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) out.push(r.items.sort((a, b) => a.x - b.x).map((i) => i.s));
  }
  await doc.cleanup();
  return out;
}

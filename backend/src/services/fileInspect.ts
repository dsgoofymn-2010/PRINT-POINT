import { PDFDocument } from 'pdf-lib';

export type FileKind = 'pdf' | 'docx' | 'jpg' | 'png';

const MIME: Record<FileKind, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  png: 'image/png',
};

export const ALLOWED_MIME = Object.values(MIME);

/** Detects the real file type from magic bytes so a renamed file cannot slip through. */
export function detectKind(buf: Buffer, originalName: string): FileKind | null {
  const ext = originalName.toLowerCase().split('.').pop() ?? '';
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  // DOCX is a ZIP container containing word/document.xml
  if (buf[0] === 0x50 && buf[1] === 0x4b && ext === 'docx' && buf.includes(Buffer.from('word/'))) return 'docx';
  return null;
}

export const mimeFor = (k: FileKind) => MIME[k];

export async function countPages(buf: Buffer, kind: FileKind): Promise<number | null> {
  if (kind === 'jpg' || kind === 'png') return 1;
  if (kind === 'pdf') {
    try {
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
      return doc.getPageCount();
    } catch {
      return null;
    }
  }
  // DOCX page count depends on rendering; read the app.xml hint when present.
  const m = /<Pages>(\d+)<\/Pages>/.exec(buf.toString('latin1'));
  return m ? Number(m[1]) : null;
}

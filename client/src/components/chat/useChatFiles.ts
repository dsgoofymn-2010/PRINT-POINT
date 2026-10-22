import { useCallback, useEffect, useRef, useState } from 'react';
import { api, uploadWithProgress } from '@/lib/api';
import type { UploadedFile } from '@/lib/types';

export const MAX_FILE_MB = Number(import.meta.env.VITE_MAX_FILE_MB ?? 25);
export const MAX_FILES = 10;
const ALLOWED_EXT = ['pdf', 'docx', 'jpg', 'jpeg', 'png'];
export const ACCEPT = '.pdf,.docx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png';

export interface ChatFile {
  key: string;
  name: string;
  size: number;
  file: File | null;
  status: 'waiting' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
  uploaded?: UploadedFile;
  /** Typed by the customer when the server cannot count pages (some DOCX). */
  pagesOverride?: number;
}

/** Quick client-side check; the server re-checks the real file type by its content. */
export function checkFile(f: File): string | null {
  const ext = f.name.toLowerCase().split('.').pop() ?? '';
  if (!ALLOWED_EXT.includes(ext)) return 'Only PDF, DOCX, JPG and PNG files can be printed';
  if (f.size > MAX_FILE_MB * 1024 * 1024) return `This file is larger than ${MAX_FILE_MB} MB`;
  if (f.size === 0) return 'This file is empty';
  return null;
}

/**
 * Holds the files for one request. Files picked before sign-in wait locally
 * and upload as soon as `canUpload` turns true.
 */
export function useChatFiles(canUpload: boolean) {
  const [files, setFiles] = useState<ChatFile[]>([]);
  const started = useRef(new Set<string>());

  const update = useCallback((key: string, patch: Partial<ChatFile>) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f))), []);

  const add = useCallback((list: FileList | File[]) => {
    const incoming = Array.from(list);
    setFiles((fs) => {
      const room = MAX_FILES - fs.length;
      const next = incoming.slice(0, Math.max(0, room)).map<ChatFile>((f) => {
        const err = checkFile(f);
        return { key: crypto.randomUUID(), name: f.name, size: f.size, file: err ? null : f, status: err ? 'error' : 'waiting', progress: 0, error: err ?? undefined };
      });
      const dropped = incoming.length - next.length;
      const warn: ChatFile[] = dropped > 0
        ? [{ key: crypto.randomUUID(), name: `${dropped} more file${dropped > 1 ? 's' : ''}`, size: 0, file: null, status: 'error', progress: 0, error: `You can send up to ${MAX_FILES} files per request` }]
        : [];
      return [...fs, ...next, ...warn];
    });
  }, []);

  const upload = useCallback(
    async (f: ChatFile) => {
      if (!f.file) return;
      started.current.add(f.key);
      update(f.key, { status: 'uploading', progress: 0, error: undefined });
      const form = new FormData();
      form.append('files', f.file);
      try {
        const r = await uploadWithProgress<{ files: UploadedFile[] }>('/uploads', form, (p) => update(f.key, { progress: p }));
        update(f.key, { status: 'done', progress: 100, uploaded: r.files[0] });
      } catch (e) {
        started.current.delete(f.key);
        update(f.key, { status: 'error', error: e instanceof Error ? e.message : 'Upload failed' });
      }
    },
    [update],
  );

  // Start uploads once signed in.
  useEffect(() => {
    if (!canUpload) return;
    files.filter((f) => f.status === 'waiting' && !started.current.has(f.key)).forEach((f) => void upload(f));
  }, [canUpload, files, upload]);

  const remove = useCallback((key: string) => {
    setFiles((fs) => {
      const f = fs.find((x) => x.key === key);
      // Delete from the server too; ignore failures (the cleanup job removes it within 24h).
      if (f?.uploaded) void api.del(`/uploads/${f.uploaded.id}`).catch(() => undefined);
      return fs.filter((x) => x.key !== key);
    });
  }, []);

  const retry = useCallback((key: string) => {
    setFiles((fs) => fs.map((f) => (f.key === key && f.file ? { ...f, status: 'waiting', error: undefined } : f)));
  }, []);

  const setPages = useCallback((key: string, n: number | undefined) => update(key, { pagesOverride: n }), [update]);
  const reset = useCallback(() => {
    started.current.clear();
    setFiles([]);
  }, []);

  const ready = files.filter((f) => f.status === 'done' && f.uploaded);
  const busy = files.some((f) => f.status === 'uploading' || (f.status === 'waiting' && canUpload));
  const needPages = ready.filter((f) => f.uploaded!.pageCount == null && !f.pagesOverride);

  return { files, add, remove, retry, setPages, reset, ready, busy, needPages };
}

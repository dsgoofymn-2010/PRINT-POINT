import { useRef, useState, type DragEvent } from 'react';
import { fileSize } from '@/lib/format';
import { cn } from '../ui';
import { ACCEPT, MAX_FILE_MB, MAX_FILES, type ChatFile } from './useChatFiles';

interface Props {
  files: ChatFile[];
  onAdd: (files: FileList | File[]) => void;
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
  onPages: (key: string, n: number | undefined) => void;
  signedIn: boolean;
  locked?: boolean;
}

/** Drop zone + file list with size, page count, progress and remove. */
export function FileStep({ files, onAdd, onRemove, onRetry, onPages, signedIn, locked }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!locked && e.dataTransfer.files.length) onAdd(e.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      {!locked && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
          className={cn(
            'flex flex-col items-start gap-3 rounded-card border-2 border-dashed px-4 py-5 transition-colors sm:flex-row sm:items-center sm:justify-between',
            over ? 'border-cyan-ink bg-cyan/10' : 'border-control bg-surface hover:border-cyan-ink',
          )}
        >
          <div>
            <p className="text-[1.0625rem] font-medium">Drop files here</p>
            <p className="text-[0.9375rem] text-muted">PDF, DOCX, JPG or PNG · up to {MAX_FILE_MB} MB each · {MAX_FILES} files max</p>
          </div>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="min-h-[44px] whitespace-nowrap rounded-control bg-primary px-5 text-[1.0625rem] font-medium text-on-primary hover:opacity-90"
          >
            Choose files
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) onAdd(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {files.length > 0 && (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {files.map((f) => (
            <li key={f.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[1.0625rem] font-medium" title={f.name}>{f.name}</p>
                <p className="text-[0.9375rem] text-muted">
                  {f.size > 0 && fileSize(f.size)}
                  {f.status === 'done' && f.uploaded?.pageCount != null && ` · ${f.uploaded.pageCount} page${f.uploaded.pageCount === 1 ? '' : 's'}`}
                  {f.status === 'waiting' && !signedIn && ' · uploads after you sign in'}
                  {f.status === 'uploading' && ` · uploading ${f.progress}%`}
                </p>
                {f.status === 'uploading' && (
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded bg-active" aria-hidden="true">
                    <div className="h-full bg-ink transition-[width]" style={{ width: `${f.progress}%` }} />
                  </div>
                )}
                {f.status === 'error' && (
                  <p className="text-[0.9375rem] text-negative" role="alert">
                    {f.error}
                    {f.file && (
                      <button className="ml-2 underline underline-offset-2" onClick={() => onRetry(f.key)}>
                        Try again
                      </button>
                    )}
                  </p>
                )}
                {f.status === 'done' && f.uploaded?.pageCount == null && (
                  <label className="mt-2 flex items-center gap-2 text-[0.9375rem]">
                    We couldn’t count the pages. How many?
                    <input
                      type="number"
                      min={1}
                      max={2000}
                      inputMode="numeric"
                      disabled={locked}
                      value={f.pagesOverride ?? ''}
                      onChange={(e) => onPages(f.key, e.target.value ? Math.max(1, Math.min(2000, Number(e.target.value))) : undefined)}
                      className="num h-10 w-20 rounded-control border border-control bg-surface px-2 text-[1.0625rem]"
                    />
                  </label>
                )}
              </div>
              {!locked && (
                <button
                  type="button"
                  onClick={() => onRemove(f.key)}
                  className="min-h-[44px] rounded-control px-3 text-[0.9375rem] text-muted hover:bg-active hover:text-ink"
                  aria-label={`Remove ${f.name}`}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

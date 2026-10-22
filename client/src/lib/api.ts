const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message);
  }
}

let accessToken: string | null = null;
let onAuthLost: (() => void) | null = null;
let refreshing: Promise<boolean> | null = null;

export const setAccessToken = (t: string | null) => {
  accessToken = t;
};
export const getAccessToken = () => accessToken;
export const setOnAuthLost = (fn: () => void) => {
  onAuthLost = fn;
};

/** Exchanges the httpOnly refresh cookie for a fresh access token (single-flight). */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (r) => {
      if (!r.ok) return false;
      const data = (await r.json()) as { accessToken: string };
      accessToken = data.accessToken;
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

interface Options {
  method?: string;
  body?: unknown;
  form?: FormData;
  raw?: boolean;
}

async function send(path: string, opts: Options): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
    headers,
    credentials: 'include',
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
}

async function request(path: string, opts: Options = {}): Promise<Response> {
  let res = await send(path, opts);
  if (res.status === 401 && accessToken && !path.startsWith('/auth/')) {
    if (await refreshSession()) res = await send(path, opts);
    else {
      accessToken = null;
      onAuthLost?.();
    }
  }
  if (!res.ok) {
    let msg = res.status === 0 ? 'Network error' : `Request failed (${res.status})`;
    let code: string | undefined;
    let details: unknown;
    try {
      const data = (await res.json()) as { error?: { message?: string; code?: string; details?: unknown } };
      msg = data.error?.message ?? msg;
      code = data.error?.code;
      details = data.error?.details;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, msg, code, details);
  }
  return res;
}

export const api = {
  get: async <T>(path: string) => (await (await request(path)).json()) as T,
  post: async <T>(path: string, body: unknown = {}) => (await (await request(path, { body })).json()) as T,
  put: async <T>(path: string, body: unknown) => (await (await request(path, { method: 'PUT', body })).json()) as T,
  patch: async <T>(path: string, body: unknown) => (await (await request(path, { method: 'PATCH', body })).json()) as T,
  del: async <T>(path: string) => (await (await request(path, { method: 'DELETE' })).json()) as T,
  upload: async <T>(path: string, form: FormData) => (await (await request(path, { form })).json()) as T,
  /** Asks for a short-lived signed link, then opens (preview) or saves the file. */
  openFile: async (fileId: string, mode: 'inline' | 'attachment' = 'inline') => {
    const { url } = (await (await request(`/uploads/${fileId}/link?d=${mode}`)).json()) as { url: string };
    const full = `${import.meta.env.VITE_API_URL ?? ''}${url}`;
    if (mode === 'inline') window.open(full, '_blank', 'noopener');
    else {
      const a = document.createElement('a');
      a.href = full;
      a.rel = 'noopener';
      a.click();
    }
  },
  /** Downloads an authenticated file and triggers a browser save. */
  download: async (path: string, fallbackName: string) => {
    const res = await request(path);
    const cd = res.headers.get('Content-Disposition') ?? '';
    const m = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/.exec(cd);
    const name = m ? decodeURIComponent(m[1] ?? m[2]) : fallbackName;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

/** Upload with progress (fetch has no upload progress events). */
export function uploadWithProgress<T>(path: string, form: FormData, onProgress: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}${path}`);
    xhr.withCredentials = true;
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new ApiError(xhr.status, (data as { error?: { message?: string } })?.error?.message ?? 'Upload failed'));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Network error. Check your connection and try again.'));
    xhr.send(form);
  });
}

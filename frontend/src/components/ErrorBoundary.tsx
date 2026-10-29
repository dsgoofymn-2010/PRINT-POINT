import { Component, type ErrorInfo, type ReactNode } from 'react';

const RELOAD_KEY = 'pp_chunk_reload';

/** True when a lazy page's file is missing, usually because a new version was deployed. */
const isChunkError = (e: unknown) =>
  e instanceof Error && /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(e.message);

/** Reloads once to pick up the new deploy; the session flag stops a reload loop. */
function reloadOnce(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false;
    sessionStorage.setItem(RELOAD_KEY, '1');
  } catch {
    /* storage blocked: still reload once */
  }
  window.location.reload();
  return true;
}

// Vite fires this when a preloaded file for a lazy page fails to load.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce()) event.preventDefault();
});
// A page that loaded fine means the reload worked; allow another one after the next deploy.
window.addEventListener('load', () => {
  setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      /* ignore */
    }
  }, 10_000);
});

interface State {
  error: Error | null;
}

/** Shows a friendly screen instead of a blank page when something crashes. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkError(error) && reloadOnce()) return;
    // Keep the details in the console for debugging; the screen stays simple.
    console.error('App crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const updated = isChunkError(this.state.error);
    return (
      <main role="alert" className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-surface px-4 text-center text-ink">
        <h1 className="text-2xl font-semibold">{updated ? 'PrintPoint was updated' : 'Something went wrong'}</h1>
        <p className="text-muted">{updated ? 'Reload to get the latest version.' : 'Reload the page to try again. Your uploaded files are safe.'}</p>
        <button
          onClick={() => window.location.reload()}
          className="min-h-[44px] rounded-control bg-ink px-5 font-medium text-surface"
        >
          Reload
        </button>
      </main>
    );
  }
}

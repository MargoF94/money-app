// Tiny hash router: #/path?query. Hash routes keep page refreshes working on GitHub Pages.

export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return {
    path,
    segments: path.split('/').filter(Boolean).map(decodeURIComponent),
    query: new URLSearchParams(qs),
  };
}

class Router {
  route = $state<Route>(parse());

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', () => {
        this.route = parse();
        window.scrollTo(0, 0);
      });
    }
  }

  go(path: string, replace = false) {
    const url = '#' + path;
    if (replace) {
      history.replaceState(null, '', url);
      this.route = parse();
    } else {
      location.hash = path;
    }
  }

  back(fallback = '/') {
    if (history.length > 1) history.back();
    else this.go(fallback);
  }

  /** Updates query params without adding a history entry. */
  setQuery(params: Record<string, string | undefined>) {
    const q = new URLSearchParams(this.route.query);
    for (const [k, v] of Object.entries(params)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    const s = q.toString();
    this.go(this.route.path + (s ? '?' + s : ''), true);
  }
}

export const router = new Router();

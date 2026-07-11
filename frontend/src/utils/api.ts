import axios from 'axios';
import { API_URL } from './config';

declare global {
  interface Window {
    // Global injected by the App Bridge CDN script (see index.html).
    shopify?: {
      idToken: () => Promise<string>;
    };
  }
}

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
});

/**
 * Waits briefly for window.shopify to exist before giving up. App Bridge
 * (loaded via the CDN script in index.html) initializes asynchronously, and
 * React can finish mounting — and fire the first useQuery call — before it's
 * ready. Without this, the very first authenticated request on any fresh
 * page load can race App Bridge's boot and go out with no token at all,
 * getting a 401 for no real reason.
 */
async function waitForAppBridge(maxWaitMs = 2000): Promise<boolean> {
  const start = Date.now();
  while (!window.shopify?.idToken) {
    if (Date.now() - start > maxWaitMs) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
  return true;
}

/**
 * Every request gets a FRESH Shopify session token — they're only valid for
 * ~1 minute, so we must fetch a new one per-request rather than caching it
 * (this is what Shopify's "Using session tokens for user authentication"
 * automated check verifies).
 */
api.interceptors.request.use(async (config) => {
  const ready = await waitForAppBridge();
  if (ready && window.shopify?.idToken) {
    try {
      const token = await window.shopify.idToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch (err) {
      // App Bridge exists but token retrieval itself failed (e.g. not
      // actually in an embedded context) — let the request go through
      // unauthenticated; the backend will 401 and the response interceptor
      // below sends the merchant through install/OAuth.
      console.warn('Could not get Shopify session token:', err);
    }
  } else {
    console.warn('App Bridge (window.shopify) never became available — request will go out unauthenticated.');
  }
  return config;
});

let redirectingToInstall = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !redirectingToInstall) {
      const shop = getShop();
      if (shop) {
        redirectingToInstall = true;
        const backendBase = API_URL.replace('/api/v1', '');
        const installUrl = `${backendBase}/api/v1/auth/install?shop=${shop}`;
        // window.open(url, '_top') reliably escapes an embedded iframe even
        // cross-origin, unlike directly assigning window.top.location.href,
        // which browsers can silently block without throwing — leaving the
        // iframe's OWN location changed instead (a blank dead-end page,
        // with the Shopify admin chrome around it untouched, since the
        // address bar reflects the top document, not the iframe).
        try {
          window.open(installUrl, '_top');
        } catch (err) {
          console.error('Failed to redirect to install/OAuth:', err);
        }
        // Deliberately NOT falling back to `window.location.href = installUrl`
        // here — that would navigate this iframe itself into a dead end
        // (exactly the blank-page bug this fix addresses). If window.open
        // fails, the safest thing is to leave the current page as-is rather
        // than break it further.
      } else {
        window.location.href = '/install-expired';
      }
    }
    return Promise.reject(error);
  },
);

function getShop(): string | null {
  const stored = localStorage.getItem('cfup_shop');
  if (stored) return stored;

  const params = new URLSearchParams(window.location.search);
  const shop = params.get('shop');
  if (shop) return shop;

  const host = params.get('host');
  if (host) {
    try {
      const decoded = atob(host);
      const match = decoded.match(/([^/]+\.myshopify\.com)/);
      if (match) return match[1];
    } catch {}
  }

  return null;
}

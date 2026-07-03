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
 * Every request gets a FRESH Shopify session token — they're only valid for
 * ~1 minute, so we must fetch a new one per-request rather than caching it
 * (this is what Shopify's "Using session tokens for user authentication"
 * automated check verifies).
 */
api.interceptors.request.use(async (config) => {
  if (window.shopify?.idToken) {
    try {
      const token = await window.shopify.idToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch (err) {
      // App Bridge not ready yet / not in an embedded context — let the
      // request go through unauthenticated; the backend will 401 and the
      // response interceptor below sends the merchant through install/OAuth.
      console.warn('Could not get Shopify session token:', err);
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const shop = getShop();
      if (shop) {
        const backendBase = API_URL.replace('/api/v1', '');
        const installUrl = `${backendBase}/api/v1/auth/install?shop=${shop}`;
        // Use window.top to break out of the Shopify admin iframe
        // so the OAuth redirect reaches accounts.shopify.com correctly
        try {
          if (window.top) {
            window.top.location.href = installUrl;
          } else {
            window.location.href = installUrl;
          }
        } catch {
          window.location.href = installUrl;
        }
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

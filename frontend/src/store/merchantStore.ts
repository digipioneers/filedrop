import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MerchantState {
  token: string | null;
  shop: string | null;
  planName: 'free' | 'starter' | 'pro' | null;
  setToken: (token: string) => void;
  setShop: (shop: string) => void;
  setPlanName: (planName: 'free' | 'starter' | 'pro') => void;
  clearSession: () => void;
}

export const useMerchantStore = create<MerchantState>()(
  persist(
    (set) => ({
      token: null,
      shop: null,
      planName: null,
      setToken: (token) => set({ token }),
      setShop: (shop) => set({ shop }),
      setPlanName: (planName) => set({ planName }),
      clearSession: () => set({ token: null, shop: null, planName: null }),
    }),
    {
      name: 'cfup-merchant',
      // Only persist token and shop — planName fetched fresh
      partialize: (state) => ({ token: state.token, shop: state.shop }),
    },
  ),
);

// ─── UI state (not persisted) ─────────────────────────────────────────────────

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  toast: { message: string; tone?: 'success' | 'critical' | 'warning' } | null;
  showToast: (message: string, tone?: 'success' | 'critical' | 'warning') => void;
  hideToast: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toast: null,
  showToast: (message, tone) => set({ toast: { message, tone } }),
  hideToast: () => set({ toast: null }),
}));

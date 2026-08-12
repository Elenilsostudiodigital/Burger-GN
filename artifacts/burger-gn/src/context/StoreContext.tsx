import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getStoreSettings, StoreSettingsPublic } from "../lib/api";

const DEFAULT_STORE: StoreSettingsPublic = {
  storeName: "The Burger GN",
  description: "",
  logoUrl: "",
  bannerUrl: "",
  phone: "",
  whatsapp: "",
  instagram: "",
  email: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  openingHours: [],
  useAutomaticSchedule: false,
  isOpen: true,
  closedReason: null,
  nextOpenTime: null,
  statusMessage: "Aberto agora",
  blockOrdersMessage: null,
};

interface StoreContextValue {
  store: StoreSettingsPublic;
  loading: boolean;
  refresh: () => Promise<StoreSettingsPublic>;
}

const StoreContext = createContext<StoreContextValue>({
  store: DEFAULT_STORE,
  loading: true,
  refresh: async () => DEFAULT_STORE,
});

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<StoreSettingsPublic>(DEFAULT_STORE);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getStoreSettings();
      setStore(data);
      return data;
    } catch {
      return DEFAULT_STORE;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const value = useMemo(() => ({ store, loading, refresh }), [store, loading, refresh]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  return useContext(StoreContext);
}

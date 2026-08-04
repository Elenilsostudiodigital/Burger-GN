import React, { createContext, useContext, useState, useEffect } from "react";
import { adminMe, adminLogin as apiLogin, adminLogout as apiLogout } from "../lib/api";

interface AdminContextType {
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminMe()
      .then(() => setIsAdmin(true))
      .catch(() => setIsAdmin(false))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    await apiLogin(email, password);
    setIsAdmin(true);
  };

  const logout = async () => {
    await apiLogout();
    setIsAdmin(false);
  };

  return (
    <AdminContext.Provider value={{ isAdmin, loading, login, logout }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside AdminProvider");
  return ctx;
}

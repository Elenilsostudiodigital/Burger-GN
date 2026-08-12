import React from "react";
import { Link, useLocation } from "wouter";
import { FileSpreadsheet, LogOut, Settings, Users } from "lucide-react";
import { useAdmin } from "../../context/AdminContext";
import { AdminBottomNav } from "../../components/AdminBottomNav";
import ClientsCsvImport from "./ClientsCsvImport";
import { Button } from "@/components/ui/button";

type SubTab = "clientes" | "importar-clientes";

/**
 * Configurações → Clientes
 * Abas: Clientes | Importar Clientes
 *
 * Independente de /admin/importar (Importar Cardápio).
 * Não reutiliza componentes nem lógica do importador de menu.
 */
export default function ClientsSettings({
  initialTab = "clientes",
}: {
  initialTab?: SubTab;
}) {
  const { logout } = useAdmin();
  const [location, setLocation] = useLocation();
  const tab: SubTab =
    location.includes("/importar") || initialTab === "importar-clientes"
      ? "importar-clientes"
      : "clientes";

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users size={20} className="text-amber-500" />
            <div>
              <h1 className="text-white font-black uppercase text-base leading-none">Clientes</h1>
              <p className="text-zinc-600 text-xs">Configurações · Importar Clientes</p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await logout();
              setLocation("/");
            }}
            className="p-2 text-zinc-400 hover:text-red-400"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        <Link
          href="/admin/config"
          className="inline-flex items-center gap-1.5 text-zinc-500 text-xs font-bold uppercase hover:text-amber-500"
        >
          <Settings size={14} /> Voltar às configurações
        </Link>

        <div className="flex gap-2">
          <Link href="/admin/config/clientes" className="flex-1">
            <div
              className={`h-11 rounded-xl font-bold text-[11px] uppercase flex items-center justify-center gap-1.5 ${
                tab === "clientes"
                  ? "bg-amber-500 text-zinc-950"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400"
              }`}
            >
              <Users size={15} /> Clientes
            </div>
          </Link>
          <Link href="/admin/config/clientes/importar" className="flex-1">
            <div
              className={`h-11 rounded-xl font-bold text-[11px] uppercase flex items-center justify-center gap-1.5 ${
                tab === "importar-clientes"
                  ? "bg-amber-500 text-zinc-950"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400"
              }`}
            >
              <FileSpreadsheet size={15} /> Importar Clientes
            </div>
          </Link>
        </div>

        {tab === "clientes" ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
            <h3 className="text-white font-black uppercase text-sm">Clientes</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Gerencie a base de clientes. Para trazer dados do Anota AI, Excel ou outro CSV,
              use a aba Importar Clientes — funcionalidade separada do Importar Cardápio.
            </p>
            <Link href="/admin/clientes">
              <Button className="w-full h-11 rounded-xl font-bold bg-amber-500 text-zinc-950 hover:bg-amber-400">
                Abrir lista de clientes
              </Button>
            </Link>
            <Link href="/admin/config/clientes/importar">
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl font-bold border-zinc-700"
              >
                Ir para Importar Clientes
              </Button>
            </Link>
            <Link href="/admin/clientes/importar">
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl font-bold border-zinc-700"
              >
                Importação manual (um a um)
              </Button>
            </Link>
          </div>
        ) : (
          <ClientsCsvImport embedded />
        )}
      </main>

      <AdminBottomNav active="/admin/config" />
    </div>
  );
}

import { PrintersPanel } from "@/components/PrintersPanel";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ImpressorasPage() {
  const [printers, settings] = await Promise.all([
    prisma.printer.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    getSettings(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-5xl tracking-wide">Impressoras</h1>
        <p className="mt-2 text-cream/65">
          Cadastre impressoras térmicas ESC/POS (58 mm ou 80 mm), escolha a padrão e
          controle a impressão automática ao aceitar pedidos.
        </p>
      </header>
      <PrintersPanel
        initialPrinters={printers}
        autoPrintOnAccept={settings.autoPrintOnAccept}
      />
    </div>
  );
}

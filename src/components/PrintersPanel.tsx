"use client";

import { useState } from "react";

type Printer = {
  id: string;
  name: string;
  host: string;
  port: number;
  paperWidth: string;
  isDefault: boolean;
  active: boolean;
};

type Props = {
  initialPrinters: Printer[];
  autoPrintOnAccept: boolean;
};

const emptyForm = {
  name: "",
  host: "",
  port: 9100,
  paperWidth: "80" as "58" | "80",
  isDefault: false,
};

export function PrintersPanel({ initialPrinters, autoPrintOnAccept }: Props) {
  const [printers, setPrinters] = useState(initialPrinters);
  const [autoPrint, setAutoPrint] = useState(autoPrintOnAccept);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/printers");
    setPrinters(await res.json());
  }

  async function createPrinter(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/printers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao cadastrar");
      setForm(emptyForm);
      setMessage("Impressora cadastrada");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/printers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Falha");
      }
      await refresh();
      setMessage("Impressora padrão atualizada");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(printer: Printer) {
    setBusy(true);
    try {
      await fetch(`/api/printers/${printer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !printer.active }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removePrinter(id: string) {
    if (!confirm("Remover esta impressora?")) return;
    setBusy(true);
    try {
      await fetch(`/api/printers/${id}`, { method: "DELETE" });
      await refresh();
      setMessage("Impressora removida");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAutoPrint() {
    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoPrintOnAccept: !autoPrint }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha");
      setAutoPrint(data.autoPrintOnAccept);
      setMessage(
        data.autoPrintOnAccept
          ? "Impressão automática ativada"
          : "Impressão automática desativada",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-semibold text-cream">Impressão automática</p>
          <p className="text-sm text-cream/60">
            Quando um pedido for aceito, enviar cupom ESC/POS para a impressora padrão.
          </p>
        </div>
        <button type="button" className="btn-primary" disabled={busy} onClick={toggleAutoPrint}>
          {autoPrint ? "Desativar" : "Ativar"}
        </button>
      </div>

      <form onSubmit={createPrinter} className="panel space-y-4 p-5">
        <h2 className="font-display text-3xl tracking-wide">Nova impressora</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="field"
            placeholder="Nome (ex: Cozinha 80mm)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            className="field"
            placeholder="IP / host"
            value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
            required
          />
          <input
            className="field"
            type="number"
            placeholder="Porta"
            value={form.port}
            onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
            required
          />
          <select
            className="field"
            value={form.paperWidth}
            onChange={(e) =>
              setForm({ ...form, paperWidth: e.target.value as "58" | "80" })
            }
          >
            <option value="80">80 mm</option>
            <option value="58">58 mm</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isDefault}
            onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
          />
          Definir como padrão
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>
          Cadastrar impressora
        </button>
      </form>

      {message && (
        <p className="rounded-md border border-cream/15 bg-cream/5 px-3 py-2 text-sm">
          {message}
        </p>
      )}

      <div className="space-y-3">
        {printers.map((printer) => (
          <article key={printer.id} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">
                  {printer.name}{" "}
                  {printer.isDefault && (
                    <span className="ml-2 text-xs uppercase tracking-wider text-mustard">
                      Padrão
                    </span>
                  )}
                </p>
                <p className="text-sm text-cream/60">
                  {printer.host}:{printer.port} · {printer.paperWidth} mm ·{" "}
                  {printer.active ? "Ativa" : "Inativa"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!printer.isDefault && (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => setDefault(printer.id)}
                  >
                    Tornar padrão
                  </button>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => toggleActive(printer)}
                >
                  {printer.active ? "Desativar" : "Ativar"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => removePrinter(printer.id)}
                >
                  Remover
                </button>
              </div>
            </div>
          </article>
        ))}
        {printers.length === 0 && (
          <p className="panel p-5 text-cream/60">Nenhuma impressora cadastrada.</p>
        )}
      </div>
    </div>
  );
}

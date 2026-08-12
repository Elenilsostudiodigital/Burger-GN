import React from "react";
import type { CsvImportOptions } from "../../lib/csv";

interface ImportOptionsFormProps {
  value: CsvImportOptions;
  disabled?: boolean;
  onChange: (next: CsvImportOptions) => void;
}

const OPTIONS: { key: keyof CsvImportOptions; label: string; hint?: string }[] = [
  { key: "updateExisting", label: "Atualizar clientes existentes", hint: "Mesmo telefone no banco → atualiza" },
  { key: "createMissing", label: "Criar clientes inexistentes" },
  { key: "importCashback", label: "Importar Cashback" },
  { key: "importStamps", label: "Importar Selos" },
  { key: "importClubPoints", label: "Importar Pontos" },
  { key: "importBirthDate", label: "Importar Data de Nascimento" },
  { key: "skipWithoutPhone", label: "Ignorar linhas sem telefone" },
  {
    key: "skipDuplicates",
    label: "Ignorar clientes duplicados",
    hint: "Telefones repetidos no arquivo são ignorados após a 1ª ocorrência",
  },
];

export function ImportOptionsForm({ value, disabled, onChange }: ImportOptionsFormProps) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-white font-black uppercase text-sm">Opções</h3>
        <p className="text-zinc-500 text-xs mt-1">
          Telefone é a chave principal. Nunca cria dois clientes com o mesmo número.
        </p>
      </div>
      <div className="space-y-2">
        {OPTIONS.map((opt) => (
          <label
            key={opt.key}
            className={`flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 cursor-pointer ${
              disabled ? "opacity-50 pointer-events-none" : "hover:border-zinc-700"
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-amber-500"
              checked={Boolean(value[opt.key])}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, [opt.key]: e.target.checked })}
            />
            <span>
              <span className="text-white text-sm font-medium block">{opt.label}</span>
              {opt.hint && (
                <span className="text-zinc-500 text-[11px] block mt-0.5">{opt.hint}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

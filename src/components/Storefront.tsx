"use client";

import { useMemo, useState } from "react";
import { formatBRL } from "@/lib/format";

type Product = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  category: string;
};

type CustomerInfo = {
  name: string;
  cashbackBalanceCents: number;
  stampCount: number;
  freeBurgersAvailable: number;
};

type Props = {
  products: Product[];
  cashbackPercent: number;
  clubPurchasesRequired: number;
  clubRewardProductName: string;
};

export function Storefront({
  products,
  cashbackPercent,
  clubPurchasesRequired,
  clubRewardProductName,
}: Props) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [useCashback, setUseCashback] = useState(false);
  const [useFreeBurger, setUseFreeBurger] = useState(false);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const product of products) {
      const list = map.get(product.category) ?? [];
      list.push(product);
      map.set(product.category, list);
    }
    return Array.from(map.entries());
  }, [products]);

  const items = useMemo(
    () =>
      products
        .filter((p) => cart[p.id])
        .map((p) => ({ product: p, quantity: cart[p.id] })),
    [cart, products],
  );

  const subtotalCents = items.reduce(
    (sum, item) => sum + item.product.priceCents * item.quantity,
    0,
  );

  const cashbackToUse = useCashback
    ? Math.min(customer?.cashbackBalanceCents ?? 0, subtotalCents)
    : 0;
  const totalCents = Math.max(0, subtotalCents - cashbackToUse);
  const estimatedCashback = Math.floor((totalCents * cashbackPercent) / 100);

  function add(productId: string) {
    setCart((prev) => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
  }

  function remove(productId: string) {
    setCart((prev) => {
      const next = { ...prev };
      if (!next[productId]) return prev;
      next[productId] -= 1;
      if (next[productId] <= 0) delete next[productId];
      return next;
    });
  }

  async function lookupCustomer(nextPhone: string) {
    const digits = nextPhone.replace(/\D/g, "");
    setPhone(nextPhone);
    if (digits.length < 10) {
      setCustomer(null);
      return;
    }

    const res = await fetch(`/api/customers/lookup?phone=${digits}`);
    const data = await res.json();
    if (data.found) {
      setCustomer(data.customer);
      if (!name) setName(data.customer.name);
    } else {
      setCustomer(null);
    }
  }

  async function submitOrder() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name,
          customerPhone: phone,
          notes,
          useCashbackCents: cashbackToUse,
          useFreeBurger,
          items: items.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao criar pedido");

      setMessage(
        `Pedido ${data.code} enviado! Cashback previsto: ${formatBRL(data.cashbackEarnedCents)}.`,
      );
      setCart({});
      setNotes("");
      setUseCashback(false);
      setUseFreeBurger(false);
      await lookupCustomer(phone);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:px-8 lg:grid-cols-[1.4fr_0.9fr]">
      <section id="cardapio" className="space-y-8">
        {categories.map(([category, list], index) => (
          <div
            key={category}
            className="animate-rise"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <h2 className="font-display text-4xl tracking-wide text-cream">{category}</h2>
            <div className="mt-4 space-y-3">
              {list.map((product) => (
                <article
                  key={product.id}
                  className="flex items-start justify-between gap-4 border-b border-cream/10 pb-4"
                >
                  <div>
                    <h3 className="text-lg font-semibold text-cream">{product.name}</h3>
                    <p className="mt-1 max-w-md text-sm text-cream/60">
                      {product.description}
                    </p>
                    <p className="mt-2 text-mustard">{formatBRL(product.priceCents)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {cart[product.id] ? (
                      <>
                        <button
                          type="button"
                          className="btn-secondary px-3 py-1.5"
                          onClick={() => remove(product.id)}
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm">{cart[product.id]}</span>
                        <button
                          type="button"
                          className="btn-primary px-3 py-1.5"
                          onClick={() => add(product.id)}
                        >
                          +
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => add(product.id)}
                      >
                        Adicionar
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>

      <aside className="panel animate-rise h-fit p-5 lg:sticky lg:top-6" style={{ animationDelay: "100ms" }}>
        <h2 className="font-display text-3xl tracking-wide">Seu pedido</h2>

        <div className="mt-4 space-y-3">
          {items.length === 0 && (
            <p className="text-sm text-cream/55">Adicione itens do cardápio.</p>
          )}
          {items.map((item) => (
            <div key={item.product.id} className="flex justify-between text-sm">
              <span>
                {item.quantity}x {item.product.name}
              </span>
              <span>{formatBRL(item.product.priceCents * item.quantity)}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-3 border-t border-cream/10 pt-5">
          <input
            className="field"
            placeholder="Seu nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="field"
            placeholder="WhatsApp / telefone"
            value={phone}
            onChange={(e) => lookupCustomer(e.target.value)}
          />
          <textarea
            className="field min-h-20"
            placeholder="Observações (ponto da carne, sem cebola...)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {customer && (
          <div className="mt-4 rounded-lg border border-mustard/30 bg-mustard/10 p-3 text-sm">
            <p className="font-semibold text-mustard">Clube Burger</p>
            <p className="mt-1 text-cream/80">
              Selos: {customer.stampCount}/{clubPurchasesRequired} · Cashback:{" "}
              {formatBRL(customer.cashbackBalanceCents)}
            </p>
            {customer.freeBurgersAvailable > 0 && (
              <p className="mt-1 text-cream">
                {customer.freeBurgersAvailable}× {clubRewardProductName} disponível
              </p>
            )}
          </div>
        )}

        <div className="mt-4 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={useCashback}
              disabled={!customer || (customer.cashbackBalanceCents || 0) <= 0}
              onChange={(e) => setUseCashback(e.target.checked)}
            />
            Usar cashback ({formatBRL(customer?.cashbackBalanceCents ?? 0)})
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={useFreeBurger}
              disabled={!customer || (customer.freeBurgersAvailable || 0) <= 0}
              onChange={(e) => setUseFreeBurger(e.target.checked)}
            />
            Resgatar hambúrguer grátis
          </label>
        </div>

        <div className="mt-5 space-y-1 border-t border-cream/10 pt-4 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatBRL(subtotalCents)}</span>
          </div>
          {cashbackToUse > 0 && (
            <div className="flex justify-between text-mustard">
              <span>Cashback</span>
              <span>-{formatBRL(cashbackToUse)}</span>
            </div>
          )}
          {useFreeBurger && (
            <div className="flex justify-between text-mustard">
              <span>Prêmio Clube</span>
              <span>{clubRewardProductName}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span>{formatBRL(totalCents)}</span>
          </div>
          <p className="text-cream/55">
            Você ganha ~{formatBRL(estimatedCashback)} de cashback ({cashbackPercent}%) + 1
            selo ao concluir.
          </p>
        </div>

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        {message && <p className="mt-3 text-sm text-green-300">{message}</p>}

        <button
          type="button"
          className="btn-primary mt-5 w-full"
          disabled={loading || items.length === 0 || !name || phone.replace(/\D/g, "").length < 10}
          onClick={submitOrder}
        >
          {loading ? "Enviando..." : "Finalizar pedido"}
        </button>
      </aside>
    </div>
  );
}

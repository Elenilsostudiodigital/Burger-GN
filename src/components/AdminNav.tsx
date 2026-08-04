"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const links = [
  { href: "/admin", label: "Painel" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/impressoras", label: "Impressoras" },
  { href: "/admin/clube", label: "Clube Burger" },
  { href: "/admin/cashback", label: "Cashback" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <aside className="panel flex w-full flex-col gap-6 p-5 lg:sticky lg:top-6 lg:w-64 lg:self-start">
      <div>
        <p className="font-display text-3xl tracking-wide text-cream">Burger GN</p>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-cream/50">
          Administração
        </p>
      </div>
      <nav className="flex flex-col gap-1">
        {links.map((link) => {
          const active =
            link.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                "rounded-md px-3 py-2 text-sm transition",
                active
                  ? "bg-ember text-cream"
                  : "text-cream/70 hover:bg-cream/5 hover:text-cream",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <Link href="/" className="btn-secondary mt-auto text-center">
        Ver loja
      </Link>
    </aside>
  );
}

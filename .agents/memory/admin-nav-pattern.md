---
name: Admin Nav Pattern
description: How admin bottom navigation is implemented across pages
---

Each admin page (Dashboard, MenuAdmin, Coupons, DeliveryZones, KmDelivery, SettingsHub) renders its own local `AdminNav` component (not a shared import). The nav has 6 items:
- Pedidos → /admin (LayoutDashboard icon)
- Cardápio → /admin/cardapio (UtensilsCrossed icon)
- Cupons → /admin/cupons (Tag icon)
- Bairros → /admin/taxas (MapPin icon)
- Por KM → /admin/entrega-km (Navigation icon)
- Config → /admin/config (Settings icon)

Icons use size=18, container `gap-0.5 py-2.5`, label `text-[9px] font-bold uppercase` (shrunk from size=20/gap-1/py-3/text-[10px] to fit 6 items in the bottom bar). The active item receives `text-amber-500` class, others get `text-zinc-500 hover:text-white`.

**Why:** Shared nav component caused circular import issues; copying per-page is simpler and each page knows its own active state. Item count grew from 4→6 as delivery-by-KM and a settings hub (payment gateway toggle + external links) were added.

**How to apply:** When adding a new admin page or route, copy the AdminNav pattern from any existing admin page and add the new route to all admin nav components (currently duplicated across 6 files) so they stay in sync.

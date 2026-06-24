---
name: Admin Nav Pattern
description: How admin bottom navigation is implemented across pages
---

Each admin page (Dashboard, MenuAdmin, Coupons, DeliveryZones) renders its own local `AdminNav` component (not a shared import). The nav always has 4 items:
- Pedidos → /admin (LayoutDashboard icon)
- Cardápio → /admin/cardapio (UtensilsCrossed icon)
- Cupons → /admin/cupons (Tag icon)
- Taxas → /admin/taxas (MapPin icon)

The active item receives `text-amber-500` class, others get `text-zinc-500 hover:text-white`.

**Why:** Shared nav component caused circular import issues; copying per-page is simpler and each page knows its own active state.

**How to apply:** When adding a new admin page, copy the AdminNav pattern from DeliveryZones.tsx and add the new route to all existing admin nav components.

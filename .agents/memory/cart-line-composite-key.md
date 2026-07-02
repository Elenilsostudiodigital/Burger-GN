---
name: Cart line composite keys for product customization
description: How to key cart line items when products support add-ons/notes, so variants of the same product don't merge quantities.
---

When a product supports customization (add-ons, free-text notes), key cart line items by a composite of `productId + sorted addon names + trimmed notes`, not by `productId` alone.

**Why:** A plain-cart keyed only by product id will silently merge "Burger + bacon" and "Burger, no onion" into one line, corrupting quantity and price display. This bit us when adding add-on/notes support to The Burger GN's cart.

**How to apply:** Any ordering system with per-item customization needs a `lineId`/composite key in the cart data model from the start. Server-side, always re-derive prices from `product.price + matched addon prices by name` at order-creation time — never trust client-submitted line prices, since add-ons and notes are attacker-controllable in the request body.

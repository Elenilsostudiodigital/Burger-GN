---
name: Delivery Fee Lookup
description: How delivery fees are calculated — from DB, not hardcoded constant
---

Delivery fees come from the `delivery_zones` table (neighborhood, fee, active). The API route `POST /api/orders` looks up the fee at order creation using `LOWER(neighborhood) = LOWER(body.neighborhood)`. There is NO static DELIVERY_FEE constant in the API server.

Frontend fetches active zones via `GET /api/delivery-zones` and the fee for a specific neighborhood via `GET /api/delivery-zones/fee?neighborhood=X`.

**Why:** User requested per-neighborhood pricing. Architecture is noted as "future-ready for Google Maps distance-based calculation" — the delivery_zones table has a comment about future lat/lng polygon support.

**How to apply:** To add map-based pricing, add lat/lng columns to delivery_zones and update the fee lookup in routes/orders.ts and routes/delivery_zones.ts.

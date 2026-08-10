/**
 * Sales dashboard aggregations — computed on the server from real orders.
 * Revenue / ticket / product ranking use status = "done" only.
 */
import { Router } from "express";
import { db, ordersTable, orderItemsTable } from "@workspace/db";
import { and, eq, gte, lte, sql, desc } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { phoneIdentityKey } from "../lib/clientMeta";
import {
  percentChange,
  resolveSalesPeriod,
  type ChartGranularity,
} from "../lib/salesPeriod";

const router = Router();
const DONE = "done" as const;

type PaymentMethod = "pix" | "cash" | "card";
type OrderType = "delivery" | "pickup" | "local";

function money(n: string | number | null | undefined): number {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? "0"));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

async function periodKpis(companyId: number, from: Date, to: Date) {
  const companyFilter = eq(ordersTable.companyId, companyId);
  const periodFilter = and(
    companyFilter,
    gte(ordersTable.createdAt, from),
    lte(ordersTable.createdAt, to),
  );
  const doneFilter = and(periodFilter, eq(ordersTable.status, DONE));

  const [counts] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      done: sql<number>`COUNT(*) FILTER (WHERE ${ordersTable.status} = 'done')`,
      cancelled: sql<number>`COUNT(*) FILTER (WHERE ${ordersTable.status} = 'cancelled')`,
      inProgress: sql<number>`COUNT(*) FILTER (WHERE ${ordersTable.status} IN ('new', 'preparing', 'delivery'))`,
    })
    .from(ordersTable)
    .where(periodFilter);

  const [revenueAgg] = await db
    .select({
      revenue: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)`,
      avgTicket: sql<string>`COALESCE(AVG(${ordersTable.total}), 0)`,
      doneCount: sql<number>`COUNT(*)`,
    })
    .from(ordersTable)
    .where(doneFilter);

  const phoneRows = await db
    .select({ phone: ordersTable.phone })
    .from(ordersTable)
    .where(periodFilter);

  const uniqueNorm = new Set<string>();
  for (const row of phoneRows) {
    const n = phoneIdentityKey(row.phone);
    if (n) uniqueNorm.add(n);
  }

  const revenue = money(revenueAgg?.revenue);
  const doneOrders = Number(revenueAgg?.doneCount ?? 0);
  const averageTicket = doneOrders > 0 ? money(revenueAgg?.avgTicket) : 0;

  return {
    revenue,
    orders: Number(counts?.total ?? 0),
    doneOrders,
    cancelledOrders: Number(counts?.cancelled ?? 0),
    inProgressOrders: Number(counts?.inProgress ?? 0),
    averageTicket,
    uniqueCustomers: uniqueNorm.size,
  };
}

async function chartSeries(
  companyId: number,
  from: Date,
  to: Date,
  granularity: ChartGranularity,
): Promise<Array<{ label: string; total: number; orders: number }>> {
  const filter = and(
    eq(ordersTable.companyId, companyId),
    eq(ordersTable.status, DONE),
    gte(ordersTable.createdAt, from),
    lte(ordersTable.createdAt, to),
  );

  // created_at is timestamp without tz with UTC wall-clock from Node → convert to SP for labels.
  const spTs = sql`((${ordersTable.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')`;

  if (granularity === "hour") {
    const rows = await db
      .select({
        bucket: sql<string>`TO_CHAR(${spTs}, 'HH24')`,
        total: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)`,
        orders: sql<number>`COUNT(*)`,
      })
      .from(ordersTable)
      .where(filter)
      .groupBy(sql`TO_CHAR(${spTs}, 'HH24')`)
      .orderBy(sql`TO_CHAR(${spTs}, 'HH24')`);

    const byHour = new Map(rows.map((r) => [r.bucket, r]));
    const series: Array<{ label: string; total: number; orders: number }> = [];
    for (let h = 0; h < 24; h++) {
      const key = String(h).padStart(2, "0");
      const row = byHour.get(key);
      series.push({
        label: `${key}h`,
        total: money(row?.total),
        orders: Number(row?.orders ?? 0),
      });
    }
    return series;
  }

  if (granularity === "month") {
    const rows = await db
      .select({
        bucket: sql<string>`TO_CHAR(${spTs}, 'YYYY-MM')`,
        total: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)`,
        orders: sql<number>`COUNT(*)`,
      })
      .from(ordersTable)
      .where(filter)
      .groupBy(sql`TO_CHAR(${spTs}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${spTs}, 'YYYY-MM')`);
    return rows.map((r) => ({
      label: r.bucket,
      total: money(r.total),
      orders: Number(r.orders),
    }));
  }

  const rows = await db
    .select({
      bucket: sql<string>`TO_CHAR(${spTs}, 'YYYY-MM-DD')`,
      total: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)`,
      orders: sql<number>`COUNT(*)`,
    })
    .from(ordersTable)
    .where(filter)
    .groupBy(sql`TO_CHAR(${spTs}, 'YYYY-MM-DD')`)
    .orderBy(sql`TO_CHAR(${spTs}, 'YYYY-MM-DD')`);
  return rows.map((r) => ({
    label: r.bucket,
    total: money(r.total),
    orders: Number(r.orders),
  }));
}

router.get("/admin/sales-dashboard", requireCompanyAuth, async (req, res) => {
  try {
    const companyId = req.companyId!;
    const period = resolveSalesPeriod({
      preset: String(req.query["preset"] || ""),
      from: req.query["from"],
      to: req.query["to"],
    });

    const companyFilter = eq(ordersTable.companyId, companyId);
    const periodFilter = and(
      companyFilter,
      gte(ordersTable.createdAt, period.from),
      lte(ordersTable.createdAt, period.to),
    );
    const doneFilter = and(periodFilter, eq(ordersTable.status, DONE));

    const [current, previous, chart] = await Promise.all([
      periodKpis(companyId, period.from, period.to),
      periodKpis(companyId, period.prevFrom, period.prevTo),
      chartSeries(companyId, period.from, period.to, period.granularity),
    ]);

    // ── Top products (done only) ─────────────────────────────────────────────
    const topProductsRaw = await db
      .select({
        name: orderItemsTable.productName,
        quantity: sql<number>`COALESCE(SUM(${orderItemsTable.quantity}), 0)`,
        revenue: sql<string>`COALESCE(SUM(${orderItemsTable.subtotal}), 0)`,
      })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .where(doneFilter)
      .groupBy(orderItemsTable.productName)
      .orderBy(desc(sql`SUM(${orderItemsTable.quantity})`))
      .limit(10);

    const topProducts = topProductsRaw.map((r, i) => ({
      rank: i + 1,
      name: r.name,
      quantity: Number(r.quantity),
      revenue: money(r.revenue),
    }));

    // ── Payment methods (done only) ──────────────────────────────────────────
    const payRows = await db
      .select({
        method: ordersTable.paymentMethod,
        revenue: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(ordersTable)
      .where(doneFilter)
      .groupBy(ordersTable.paymentMethod);

    const paymentMethods: Record<
      PaymentMethod,
      { revenue: number; count: number; percent: number }
    > = {
      pix: { revenue: 0, count: 0, percent: 0 },
      cash: { revenue: 0, count: 0, percent: 0 },
      card: { revenue: 0, count: 0, percent: 0 },
    };
    for (const row of payRows) {
      const method = row.method as PaymentMethod;
      if (method in paymentMethods) {
        paymentMethods[method] = {
          revenue: money(row.revenue),
          count: Number(row.count),
          percent: 0,
        };
      }
    }
    const payTotal = Object.values(paymentMethods).reduce((s, m) => s + m.revenue, 0);
    for (const key of Object.keys(paymentMethods) as PaymentMethod[]) {
      paymentMethods[key].percent =
        payTotal > 0
          ? Math.round((paymentMethods[key].revenue / payTotal) * 1000) / 10
          : 0;
    }

    // ── Order types ──────────────────────────────────────────────────────────
    const typeRows = await db
      .select({
        orderType: ordersTable.orderType,
        revenue: sql<string>`COALESCE(SUM(${ordersTable.total}) FILTER (WHERE ${ordersTable.status} = 'done'), 0)`,
        count: sql<number>`COUNT(*)`,
        doneCount: sql<number>`COUNT(*) FILTER (WHERE ${ordersTable.status} = 'done')`,
      })
      .from(ordersTable)
      .where(periodFilter)
      .groupBy(ordersTable.orderType);

    const orderTypes: Record<
      OrderType,
      { count: number; doneCount: number; revenue: number }
    > = {
      delivery: { count: 0, doneCount: 0, revenue: 0 },
      pickup: { count: 0, doneCount: 0, revenue: 0 },
      local: { count: 0, doneCount: 0, revenue: 0 },
    };
    for (const row of typeRows) {
      const t = row.orderType as OrderType;
      if (t in orderTypes) {
        orderTypes[t] = {
          count: Number(row.count),
          doneCount: Number(row.doneCount),
          revenue: money(row.revenue),
        };
      }
    }

    // ── Customers: new vs returning (by WhatsApp identity key) ───────────────
    // Load period phones + company-wide first order per raw phone, then merge
    // by phoneIdentityKey so format variants count as one person.
    const periodPhones = await db
      .select({
        phone: ordersTable.phone,
        firstInPeriod: sql<string>`MIN(${ordersTable.createdAt})`,
      })
      .from(ordersTable)
      .where(periodFilter)
      .groupBy(ordersTable.phone);

    const identityInPeriod = new Map<string, Date>();
    for (const row of periodPhones) {
      const key = phoneIdentityKey(row.phone);
      if (!key) continue;
      const at = new Date(row.firstInPeriod);
      const prev = identityInPeriod.get(key);
      if (!prev || at < prev) identityInPeriod.set(key, at);
    }

    let newCustomers = 0;
    let returningCustomers = 0;
    const uniqueList = [...identityInPeriod.keys()];
    if (uniqueList.length > 0) {
      const history = await db
        .select({
          phone: ordersTable.phone,
          first: sql<string>`MIN(${ordersTable.createdAt})`,
        })
        .from(ordersTable)
        .where(companyFilter)
        .groupBy(ordersTable.phone);

      const firstEverByIdentity = new Map<string, Date>();
      for (const row of history) {
        const key = phoneIdentityKey(row.phone);
        if (!key || !identityInPeriod.has(key)) continue;
        const at = new Date(row.first);
        const prev = firstEverByIdentity.get(key);
        if (!prev || at < prev) firstEverByIdentity.set(key, at);
      }

      for (const key of uniqueList) {
        const firstEver = firstEverByIdentity.get(key);
        if (!firstEver || firstEver >= period.from) newCustomers++;
        else returningCustomers++;
      }
    }

    // ── Performance ──────────────────────────────────────────────────────────
    const spTs = sql`((${ordersTable.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')`;

    const [peakHourRow] = await db
      .select({
        hour: sql<string>`TO_CHAR(${spTs}, 'HH24')`,
        orders: sql<number>`COUNT(*)`,
      })
      .from(ordersTable)
      .where(periodFilter)
      .groupBy(sql`TO_CHAR(${spTs}, 'HH24')`)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(1);

    const [bestDayRow] = await db
      .select({
        day: sql<string>`TO_CHAR(${spTs}, 'YYYY-MM-DD')`,
        revenue: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)`,
        orders: sql<number>`COUNT(*)`,
      })
      .from(ordersTable)
      .where(doneFilter)
      .groupBy(sql`TO_CHAR(${spTs}, 'YYYY-MM-DD')`)
      .orderBy(desc(sql`SUM(${ordersTable.total})`))
      .limit(1);

    const [itemsAgg] = await db
      .select({
        totalItems: sql<number>`COALESCE(SUM(${orderItemsTable.quantity}), 0)`,
        orderCount: sql<number>`COUNT(DISTINCT ${orderItemsTable.orderId})`,
      })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .where(doneFilter);

    const doneWithItems = Number(itemsAgg?.orderCount ?? 0);
    const totalItems = Number(itemsAgg?.totalItems ?? 0);
    const avgItemsPerOrder =
      doneWithItems > 0 ? Math.round((totalItems / doneWithItems) * 10) / 10 : 0;

    const champion = topProducts[0] ?? null;

    res.json({
      period: {
        preset: period.preset,
        from: period.fromIso,
        to: period.toIso,
        fromAt: period.from.toISOString(),
        toAt: period.to.toISOString(),
        previousFrom: period.prevFromIso,
        previousTo: period.prevToIso,
        granularity: period.granularity,
        comparisonLabel: period.comparisonLabel,
        timezone: "America/Sao_Paulo",
      },
      kpis: {
        revenue: {
          value: current.revenue,
          previous: previous.revenue,
          changePercent: percentChange(current.revenue, previous.revenue),
        },
        orders: {
          value: current.orders,
          previous: previous.orders,
          changePercent: percentChange(current.orders, previous.orders),
        },
        averageTicket: {
          value: current.averageTicket,
          previous: previous.averageTicket,
          changePercent: percentChange(current.averageTicket, previous.averageTicket),
        },
        uniqueCustomers: {
          value: current.uniqueCustomers,
          previous: previous.uniqueCustomers,
          changePercent: percentChange(
            current.uniqueCustomers,
            previous.uniqueCustomers,
          ),
        },
      },
      ordersBreakdown: {
        completed: current.doneOrders,
        cancelled: current.cancelledOrders,
        inProgress: current.inProgressOrders,
        total: current.orders,
        validRevenue: current.revenue,
        cancelledExcludedFromRevenue: true,
      },
      customers: {
        new: newCustomers,
        returning: returningCustomers,
        unique: current.uniqueCustomers,
      },
      paymentMethods,
      orderTypes,
      topProducts,
      chart: {
        granularity: period.granularity,
        series: chart,
      },
      performance: {
        peakHour: peakHourRow
          ? {
              hour: `${peakHourRow.hour}h`,
              orders: Number(peakHourRow.orders),
            }
          : null,
        bestDay: bestDayRow
          ? {
              day: bestDayRow.day,
              revenue: money(bestDayRow.revenue),
              orders: Number(bestDayRow.orders),
            }
          : null,
        topProduct: champion
          ? { name: champion.name, quantity: champion.quantity, revenue: champion.revenue }
          : null,
        averageTicket: current.averageTicket,
        avgItemsPerOrder,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to build sales dashboard");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

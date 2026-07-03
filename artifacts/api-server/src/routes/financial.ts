import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, orderItemsTable, productsTable, categoriesTable } from "@workspace/db";
import { and, gte, lte, eq, ne, inArray, isNotNull, sql, desc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

// Revenue metrics only count "done" (fulfilled) orders — pending/cancelled orders
// are not realized revenue. Counts of orders by status (total/delivered/cancelled/pending)
// use all orders in the period regardless of status.
const DONE = "done" as const;

function parseDate(value: unknown, fallback: Date): Date {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) return d;
  }
  return fallback;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}
function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  const day = r.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1; // Monday as start of week
  r.setDate(r.getDate() - diff);
  return r;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}

async function sumRevenueSince(since: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)` })
    .from(ordersTable)
    .where(and(eq(ordersTable.status, DONE), gte(ordersTable.createdAt, since)));
  return parseFloat(row?.total ?? "0");
}

router.get("/admin/financial-report", requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const defaultFrom = startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
    const from = startOfDay(parseDate(req.query["from"], defaultFrom));
    const to = endOfDay(parseDate(req.query["to"], now));

    const periodFilter = and(gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to));
    const periodDoneFilter = and(periodFilter, eq(ordersTable.status, DONE));

    // ── Fixed revenue cards (always "live", independent of the period filter) ──
    const [todayRevenue, weekRevenue, monthRevenue, yearRevenue] = await Promise.all([
      sumRevenueSince(startOfDay(now)),
      sumRevenueSince(startOfWeek(now)),
      sumRevenueSince(startOfMonth(now)),
      sumRevenueSince(startOfYear(now)),
    ]);

    // ── Order counts by status within the selected period ──
    const [countRow] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        delivered: sql<number>`COUNT(*) FILTER (WHERE ${ordersTable.status} = 'done')`,
        cancelled: sql<number>`COUNT(*) FILTER (WHERE ${ordersTable.status} = 'cancelled')`,
        pending: sql<number>`COUNT(*) FILTER (WHERE ${ordersTable.status} IN ('new', 'preparing', 'delivery'))`,
      })
      .from(ordersTable)
      .where(periodFilter);

    // ── Revenue-based aggregates (done orders only) ──
    const [revenueAgg] = await db
      .select({
        revenue: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)`,
        deliveryFees: sql<string>`COALESCE(SUM(${ordersTable.deliveryFee}), 0)`,
        avgTicket: sql<string>`COALESCE(AVG(${ordersTable.total}), 0)`,
        doneCount: sql<number>`COUNT(*)`,
      })
      .from(ordersTable)
      .where(periodDoneFilter);

    const paymentMethodsRaw = await db
      .select({
        method: ordersTable.paymentMethod,
        revenue: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(ordersTable)
      .where(periodDoneFilter)
      .groupBy(ordersTable.paymentMethod);

    const paymentMethods = { pix: { revenue: 0, count: 0 }, cash: { revenue: 0, count: 0 }, card: { revenue: 0, count: 0 } };
    for (const row of paymentMethodsRaw) {
      paymentMethods[row.method] = { revenue: parseFloat(row.revenue), count: Number(row.count) };
    }

    const [topProductRow] = await db
      .select({
        name: orderItemsTable.productName,
        quantity: sql<number>`SUM(${orderItemsTable.quantity})`,
      })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .where(periodDoneFilter)
      .groupBy(orderItemsTable.productName)
      .orderBy(desc(sql`SUM(${orderItemsTable.quantity})`))
      .limit(1);

    const [topCategoryRow] = await db
      .select({
        name: categoriesTable.name,
        quantity: sql<number>`SUM(${orderItemsTable.quantity})`,
      })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .leftJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(and(periodDoneFilter, isNotNull(categoriesTable.name)))
      .groupBy(categoriesTable.name)
      .orderBy(desc(sql`SUM(${orderItemsTable.quantity})`))
      .limit(1);

    const [topCustomerRow] = await db
      .select({
        phone: ordersTable.phone,
        name: sql<string>`MAX(${ordersTable.customerName})`,
        total: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)`,
        orderCount: sql<number>`COUNT(*)`,
      })
      .from(ordersTable)
      .where(periodDoneFilter)
      .groupBy(ordersTable.phone)
      .orderBy(desc(sql`SUM(${ordersTable.total})`))
      .limit(1);

    // ── New vs. returning customers within the period ──
    const periodPhones = await db
      .select({ phone: ordersTable.phone })
      .from(ordersTable)
      .where(periodDoneFilter)
      .groupBy(ordersTable.phone);
    const phoneList = periodPhones.map(p => p.phone);

    let newCustomers = 0;
    let returningCustomers = 0;
    if (phoneList.length > 0) {
      const firstOrders = await db
        .select({ phone: ordersTable.phone, first: sql<string>`MIN(${ordersTable.createdAt})` })
        .from(ordersTable)
        .where(inArray(ordersTable.phone, phoneList))
        .groupBy(ordersTable.phone);
      for (const row of firstOrders) {
        if (new Date(row.first) >= from) newCustomers++;
        else returningCustomers++;
      }
    }

    // ── Chart series ──
    const dailySales = await db
      .select({
        bucket: sql<string>`TO_CHAR(${ordersTable.createdAt}, 'YYYY-MM-DD')`,
        total: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)`,
        orders: sql<number>`COUNT(*)`,
      })
      .from(ordersTable)
      .where(periodDoneFilter)
      .groupBy(sql`TO_CHAR(${ordersTable.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${ordersTable.createdAt}, 'YYYY-MM-DD')`);

    const twelveWeeksAgo = startOfWeek(new Date(now.getTime() - 11 * 7 * 24 * 60 * 60 * 1000));
    const weeklySales = await db
      .select({
        bucket: sql<string>`TO_CHAR(DATE_TRUNC('week', ${ordersTable.createdAt}), 'YYYY-MM-DD')`,
        total: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)`,
        orders: sql<number>`COUNT(*)`,
      })
      .from(ordersTable)
      .where(and(eq(ordersTable.status, DONE), gte(ordersTable.createdAt, twelveWeeksAgo)))
      .groupBy(sql`DATE_TRUNC('week', ${ordersTable.createdAt})`)
      .orderBy(sql`DATE_TRUNC('week', ${ordersTable.createdAt})`);

    const twelveMonthsAgo = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 11, 1));
    const monthlySales = await db
      .select({
        bucket: sql<string>`TO_CHAR(DATE_TRUNC('month', ${ordersTable.createdAt}), 'YYYY-MM')`,
        total: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)`,
        orders: sql<number>`COUNT(*)`,
      })
      .from(ordersTable)
      .where(and(eq(ordersTable.status, DONE), gte(ordersTable.createdAt, twelveMonthsAgo)))
      .groupBy(sql`DATE_TRUNC('month', ${ordersTable.createdAt})`)
      .orderBy(sql`DATE_TRUNC('month', ${ordersTable.createdAt})`);

    const fiveYearsAgo = startOfYear(new Date(now.getFullYear() - 4, 0, 1));
    const yearlySales = await db
      .select({
        bucket: sql<string>`TO_CHAR(DATE_TRUNC('year', ${ordersTable.createdAt}), 'YYYY')`,
        total: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)`,
        orders: sql<number>`COUNT(*)`,
      })
      .from(ordersTable)
      .where(and(eq(ordersTable.status, DONE), gte(ordersTable.createdAt, fiveYearsAgo)))
      .groupBy(sql`DATE_TRUNC('year', ${ordersTable.createdAt})`)
      .orderBy(sql`DATE_TRUNC('year', ${ordersTable.createdAt})`);

    res.json({
      period: { from: from.toISOString(), to: to.toISOString() },
      fixedRevenue: {
        today: todayRevenue,
        week: weekRevenue,
        month: monthRevenue,
        year: yearRevenue,
      },
      totals: {
        totalOrders: Number(countRow?.total ?? 0),
        deliveredOrders: Number(countRow?.delivered ?? 0),
        cancelledOrders: Number(countRow?.cancelled ?? 0),
        pendingOrders: Number(countRow?.pending ?? 0),
      },
      revenue: parseFloat(revenueAgg?.revenue ?? "0"),
      averageTicket: parseFloat(revenueAgg?.avgTicket ?? "0"),
      totalDeliveryFees: parseFloat(revenueAgg?.deliveryFees ?? "0"),
      topProduct: topProductRow ? { name: topProductRow.name, quantity: Number(topProductRow.quantity) } : null,
      topCategory: topCategoryRow ? { name: topCategoryRow.name, quantity: Number(topCategoryRow.quantity) } : null,
      topCustomer: topCustomerRow
        ? { name: topCustomerRow.name, phone: topCustomerRow.phone, total: parseFloat(topCustomerRow.total), orderCount: Number(topCustomerRow.orderCount) }
        : null,
      customers: { new: newCustomers, returning: returningCustomers },
      paymentMethods,
      charts: {
        daily: dailySales.map(r => ({ label: r.bucket, total: parseFloat(r.total), orders: Number(r.orders) })),
        weekly: weeklySales.map(r => ({ label: r.bucket, total: parseFloat(r.total), orders: Number(r.orders) })),
        monthly: monthlySales.map(r => ({ label: r.bucket, total: parseFloat(r.total), orders: Number(r.orders) })),
        yearly: yearlySales.map(r => ({ label: r.bucket, total: parseFloat(r.total), orders: Number(r.orders) })),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to build financial report");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

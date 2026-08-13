/**
 * Sales dashboard period-chart mount contract (insertBefore fix).
 * Run: node scripts/sales-dashboard-chart-selftest.mjs
 *
 * Mirrors SalesPeriodChart: never keep Recharts mounted across period reloads;
 * remount only when !loading && hasData, keyed by period.
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function shouldShowChart({ loading, data }) {
  return !loading && data.some((p) => p.total > 0);
}

function chartKey(report) {
  if (!report) return "empty";
  return `${report.period.preset}:${report.period.from}:${report.period.to}:${report.chart.granularity}`;
}

/** Sequence of UI states when switching Hoje → Ontem */
function simulatePeriodSwitch(states) {
  const events = [];
  for (const s of states) {
    events.push({
      showChart: shouldShowChart(s),
      key: chartKey(s.report),
      loading: s.loading,
    });
  }
  return events;
}

let n = 0;

{
  const today = {
    loading: false,
    data: [{ total: 10 }],
    report: {
      period: { preset: "today", from: "2026-08-13", to: "2026-08-13" },
      chart: { granularity: "hour" },
    },
  };
  assert(shouldShowChart(today) === true, "hoje with data shows chart");
  n++;
}

{
  // Mid-fetch: chart must unmount (prevents Recharts+React insertBefore race)
  assert(
    shouldShowChart({ loading: true, data: [{ total: 10 }] }) === false,
    "loading hides chart",
  );
  n++;
}

{
  assert(
    shouldShowChart({ loading: false, data: [{ total: 0 }, { total: 0 }] }) === false,
    "empty period no chart",
  );
  n++;
}

{
  const seq = simulatePeriodSwitch([
    {
      loading: false,
      data: [{ total: 5 }],
      report: {
        period: { preset: "today", from: "2026-08-13", to: "2026-08-13" },
        chart: { granularity: "hour" },
      },
    },
    {
      loading: true,
      data: [{ total: 5 }],
      report: {
        period: { preset: "today", from: "2026-08-13", to: "2026-08-13" },
        chart: { granularity: "hour" },
      },
    },
    {
      loading: false,
      data: [{ total: 2 }],
      report: {
        period: { preset: "yesterday", from: "2026-08-12", to: "2026-08-12" },
        chart: { granularity: "hour" },
      },
    },
  ]);
  assert(seq[0].showChart === true, "start chart");
  assert(seq[1].showChart === false, "unmount while loading");
  assert(seq[2].showChart === true, "remount after load");
  assert(seq[0].key !== seq[2].key, "period key changes");
  n++;
}

{
  const presets = ["today", "yesterday", "7d", "30d", "month", "custom"];
  const keys = new Set();
  for (const preset of presets) {
    keys.add(
      chartKey({
        period: { preset, from: "2026-08-01", to: "2026-08-13" },
        chart: { granularity: "day" },
      }),
    );
  }
  assert(keys.size === presets.length, "each preset gets distinct key when dates differ by preset id");
  n++;
}

console.log(`sales-dashboard-chart-selftest: ${n}/5 ok`);

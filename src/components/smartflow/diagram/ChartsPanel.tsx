import { useMemo } from "react";
import { Empty, Statistic, Typography } from "antd";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SmartFlowDoc } from "../types";
import { useThemeMode } from "@/lib/theme";
import { computeGaps } from "./gaps";

/** Ordinal ramp, light -> dark, one step per mechanism rung (informal -> automated).
 *  Validated with the dataviz skill's palette checker against this app's light
 *  surface (#fcfcfb) and dark surface (#1f1f1e) — see gaps.ts's MECHANISMS order,
 *  which this array must stay aligned with. */
const MECHANISM_RAMP_LIGHT = [
  "#95bbac",
  "#7fa997",
  "#689682",
  "#51836e",
  "#3c6f5b",
  "#2a5b49",
  "#20493a",
  "#17362b",
];
const MECHANISM_RAMP_DARK = [
  "#4c7863",
  "#5f8a76",
  "#749d89",
  "#89b09d",
  "#9ec3b1",
  "#b4d6c5",
  "#cbe9d9",
  "#f2ffff",
];

/** Categorical slots for the systems donut. Validated all-pairs (any two
 *  slices can sit adjacent around a ring) against this app's own surfaces —
 *  the default 8-slot categorical order only clears all-pairs on its first
 *  three, so the chart caps at 3 named systems and folds the rest into
 *  "Other" (a neutral gray, not a 4th categorical hue). */
const DONUT_SLOTS_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a"];
const DONUT_SLOTS_DARK = ["#3987e5", "#d95926", "#199e70"];
const DONUT_OTHER_LIGHT = "#c3c2b7";
const DONUT_OTHER_DARK = "#5a5a56";
const DONUT_MAX_SLICES = 3;

/** Both charts on this page share this height so the row stays visually
 *  balanced regardless of how much data either one currently holds. */
const CHART_HEIGHT = 320;

interface Props {
  doc: SmartFlowDoc;
}

/**
 * The two findings from GapsPanel that are genuinely chart-shaped — handoffs
 * by mechanism, and systems in use. Everything else there reads better as a
 * sentence than a bar, so it stays in Summary, not here. The tab itself is
 * already labeled "Charts" — no need to repeat that as a page title too.
 */
export function ChartsPanel({ doc }: Props) {
  const gaps = useMemo(() => computeGaps(doc), [doc]);
  const { mode } = useThemeMode();
  const isDark = mode === "dark";

  if (gaps.placedCount === 0) {
    return (
      <section className="sf-charts">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Place some steps in lanes and the charts show up here."
        />
      </section>
    );
  }

  const mechanismRamp = isDark ? MECHANISM_RAMP_DARK : MECHANISM_RAMP_LIGHT;
  const donutSlots = isDark ? DONUT_SLOTS_DARK : DONUT_SLOTS_LIGHT;
  const donutOther = isDark ? DONUT_OTHER_DARK : DONUT_OTHER_LIGHT;

  const mechanismData = gaps.mechanismTally
    .map((m, i) => ({ label: m.label, count: m.count, fill: mechanismRamp[i] }))
    .filter((m) => m.count > 0);
  if (gaps.customMechanismCount > 0) {
    mechanismData.push({
      label: "Other (typed in)",
      count: gaps.customMechanismCount,
      fill: mechanismRamp[mechanismRamp.length - 1],
    });
  }

  // systemInventory is already sorted by count desc — the top 3 named systems
  // get their own slice, everything past that folds into one neutral "Other"
  // so the ring never exceeds the palette's validated all-pairs cap.
  const topSystems = gaps.systemInventory.slice(0, DONUT_MAX_SLICES);
  const otherSystems = gaps.systemInventory.slice(DONUT_MAX_SLICES);
  const otherCount = otherSystems.reduce((n, s) => n + s.count, 0);
  const systemData = [
    ...topSystems.map((s, i) => ({ name: s.name, count: s.count, fill: donutSlots[i] })),
    ...(otherCount > 0 ? [{ name: "Other", count: otherCount, fill: donutOther }] : []),
  ];

  return (
    <section className="sf-charts">
      <div className="sf-stat-row">
        <div className="sf-stat-card">
          <Statistic title="Total steps" value={doc.items.length} />
        </div>
        <div className="sf-stat-card">
          <Statistic title="Handoffs" value={gaps.answeredHandoffs.length} />
        </div>
        <div className="sf-stat-card">
          <Statistic title="Open questions" value={gaps.openQuestionCount} />
        </div>
        <div className="sf-stat-card">
          <Statistic title="Steps with no connections" value={gaps.orphans.length} />
        </div>
      </div>

      <div className="sf-chart-row">
        <RankedBarChart
          title="Handoffs"
          data={mechanismData}
          dataKey="label"
          unit="handoff"
          empty="Set a handoff method on an arrow and this fills in."
        />
        <SystemsDonut data={systemData} />
      </div>
    </section>
  );
}

interface RankedBarChartProps {
  title: string;
  data: { count: number; fill: string; [key: string]: unknown }[];
  dataKey: string;
  unit: string;
  empty: string;
}

/** A horizontal single-series bar chart, ranked by whatever order the data
 *  arrives in. Both charts on this page are this exact shape — a labeled
 *  category on one axis, a count on the other — so this is the one component,
 *  not two copies of the same recharts wiring. */
function RankedBarChart({ title, data, dataKey, unit, empty }: RankedBarChartProps) {
  return (
    <div className="sf-chart-block">
      <div className="sf-chart-head">
        <h3 className="sf-section-title sf-chart-title">{title}</h3>
      </div>
      {data.length > 0 ? (
        // Fixed at the shared chart height (matching the donut) rather than
        // shrinking to fit a handful of bars — a nearly-empty box reads as
        // broken next to a donut that always fills its frame.
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="var(--sf-chart-axis)" />
            <YAxis
              type="category"
              dataKey={dataKey}
              width={140}
              tick={{ fontSize: 12 }}
              stroke="var(--sf-chart-axis)"
            />
            <Tooltip
              cursor={{ fill: "var(--sf-chart-cursor)" }}
              contentStyle={{
                background: "var(--sf-chart-tooltip-bg)",
                border: "1px solid var(--sf-chart-tooltip-border)",
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(value) => [`${value} ${unit}${value === 1 ? "" : "s"}`, ""]}
              labelFormatter={() => ""}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false}>
              {data.map((entry) => (
                <Cell key={String(entry[dataKey])} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <Typography.Text type="secondary">{empty}</Typography.Text>
      )}
    </div>
  );
}

interface SystemsDonutProps {
  data: { name: string; count: number; fill: string }[];
}

/** Share of steps per named system — a part-to-whole question, so a donut
 *  fits where the mechanism ladder (ordinal) needs a bar instead. Capped at
 *  the top 3 named systems plus "Other" (see DONUT_MAX_SLICES) — the
 *  categorical palette only clears the all-pairs CVD gate on its first three
 *  slots, and a ring puts every slice next to every other slice at a glance. */
function SystemsDonut({ data }: SystemsDonutProps) {
  const total = data.reduce((n, s) => n + s.count, 0);
  return (
    <div className="sf-chart-block">
      <div className="sf-chart-head">
        <h3 className="sf-section-title sf-chart-title">Systems in use</h3>
      </div>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="name"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              isAnimationActive={false}
              label={(props) => {
                const entry = props.payload as { name: string; count: number };
                return `${entry.name} ${Math.round((entry.count / total) * 100)}%`;
              }}
              labelLine={false}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} stroke="var(--sf-chart-tooltip-bg)" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--sf-chart-tooltip-bg)",
                border: "1px solid var(--sf-chart-tooltip-border)",
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(value, name) => [`${value} step${value === 1 ? "" : "s"}`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <Typography.Text type="secondary">No systems named yet.</Typography.Text>
      )}
    </div>
  );
}

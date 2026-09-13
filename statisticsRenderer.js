const { createTursoClient } = require("./src/db/turso");
const dotenv = require("dotenv");
const path = require("path");
const dayjs = require("dayjs");

const envFilePath = process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });

let connection;
let connectionPromise;
let cachedData;

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const number = (value) => Number(value) || 0;
const formatMoney = (value) => money.format(number(value));
const formatDate = (value) => value ? dayjs(value).format("DD MMM YYYY") : "—";
const colorFor = (value) => number(value) >= 0 ? "#087f23" : "#dc3545";

function createConnection() {
  if (!connectionPromise) {
    connectionPromise = Promise.resolve(createTursoClient());
  }
  return connectionPromise;
}

async function getData() {
  connection = await createConnection();
  const [rows] = await connection.query(`SELECT h.id, h.date, h.instrument_id, h.qty, h.avg_cost,
    h.ltp, h.cur_val, h.p_l, h.net_chg, h.day_chg, i.name AS instrument,
    s.name AS sector
    FROM holdings h INNER JOIN instrument i ON h.instrument_id = i.id
    LEFT JOIN sector s ON i.sector_id = s.id
    WHERE i.is_active = TRUE ORDER BY h.instrument_id, h.date, h.id`);
  const [benchmarkRows] = await connection.query("SELECT date, nifty_50 FROM daily_pl WHERE nifty_50 IS NOT NULL ORDER BY date");
  return { rows, benchmarkRows };
}

function groupHoldings(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    if (!grouped.has(row.instrument_id)) grouped.set(row.instrument_id, []);
    grouped.get(row.instrument_id).push({ ...row, date: dayjs(row.date), cur_val: number(row.cur_val), p_l: number(row.p_l), qty: number(row.qty), avg_cost: number(row.avg_cost), ltp: number(row.ltp) });
  });
  return [...grouped.values()].map((history) => {
    const latest = history[history.length - 1];
    const first = history[0];
    return { instrument: latest.instrument, sector: latest.sector || "Unclassified", history, latest, first };
  });
}

function findBaseline(history, targetDate) {
  let baseline;
  history.forEach((row) => {
    if (!row.date.isAfter(targetDate)) baseline = row;
  });
  return baseline;
}

function changeFor(history, latest, amount, unit) {
  const baseline = amount === null ? history[0] : findBaseline(history, latest.date.subtract(amount, unit));
  if (!baseline || baseline === latest || !baseline.ltp) return null;
  const value = latest.ltp - baseline.ltp;
  return { value, percent: value * 100 / baseline.ltp, date: baseline.date };
}

function benchmarkAtOrBefore(benchmarkRows, targetDate) {
  let value;
  benchmarkRows.forEach((row) => {
    if (!dayjs(row.date).isAfter(targetDate)) value = number(row.nifty_50);
  });
  return value;
}

function riskMetrics(history, benchmarkRows) {
  const returns = history.slice(1).map((row, index) => {
    const previous = history[index];
    return previous.ltp ? (row.ltp - previous.ltp) / previous.ltp : null;
  }).filter((value) => value !== null && Number.isFinite(value));
  const average = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const variance = returns.length ? returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / returns.length : 0;
  const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;
  let peak = history[0]?.ltp || 0;
  let maxDrawdown = 0;
  history.forEach((row) => {
    peak = Math.max(peak, row.ltp);
    if (peak) maxDrawdown = Math.min(maxDrawdown, (row.ltp - peak) * 100 / peak);
  });

  const benchmarkByDate = new Map(benchmarkRows.map((row) => [dayjs(row.date).format("YYYY-MM-DD"), number(row.nifty_50)]));
  const paired = [];
  history.slice(1).forEach((row, index) => {
    const previous = history[index];
    const benchmark = benchmarkByDate.get(row.date.format("YYYY-MM-DD"));
    const previousBenchmark = benchmarkByDate.get(previous.date.format("YYYY-MM-DD"));
    if (previous.ltp && benchmark && previousBenchmark) paired.push({ stock: (row.ltp - previous.ltp) / previous.ltp, market: (benchmark - previousBenchmark) / previousBenchmark });
  });
  const stockAverage = paired.length ? paired.reduce((sum, row) => sum + row.stock, 0) / paired.length : 0;
  const marketAverage = paired.length ? paired.reduce((sum, row) => sum + row.market, 0) / paired.length : 0;
  const covariance = paired.length ? paired.reduce((sum, row) => sum + (row.stock - stockAverage) * (row.market - marketAverage), 0) / paired.length : 0;
  const marketVariance = paired.length ? paired.reduce((sum, row) => sum + (row.market - marketAverage) ** 2, 0) / paired.length : 0;
  const beta = marketVariance ? covariance / marketVariance : null;
  const stockStart = history[0]?.ltp || null;
  const stockEnd = history.length > 1 ? history[history.length - 1].ltp : null;
  const stockReturn = stockStart && stockEnd ? (stockEnd - stockStart) * 100 / stockStart : null;
  const marketStart = history.length ? benchmarkAtOrBefore(benchmarkRows, history[0].date) : null;
  const marketEnd = history.length ? benchmarkAtOrBefore(benchmarkRows, history[history.length - 1].date) : null;
  const marketReturn = marketStart && marketEnd && marketStart !== marketEnd ? (marketEnd - marketStart) * 100 / marketStart : null;
  const relative = stockReturn !== null && marketReturn !== null ? stockReturn - marketReturn : null;
  const score = (volatility >= 40 ? 2 : volatility >= 25 ? 1 : 0) + (Math.abs(maxDrawdown) >= 30 ? 2 : Math.abs(maxDrawdown) >= 15 ? 1 : 0) + (beta !== null && beta >= 1.3 ? 2 : beta !== null && beta >= 1 ? 1 : 0);
  return { volatility, maxDrawdown, beta, stockReturn, marketReturn, relative, level: score >= 4 ? "High" : score >= 2 ? "Medium" : "Low" };
}

function decorateHolding(item) {
  const { history, latest } = item;
  return {
    ...item,
    invested: latest.cur_val - latest.p_l,
    returnPercent: latest.cur_val - latest.p_l ? latest.p_l * 100 / (latest.cur_val - latest.p_l) : 0,
    heldDays: Math.max(0, latest.date.diff(history[0].date, "day")),
    changes: {
      day: changeFor(history, latest, 1, "day"),
      week: changeFor(history, latest, 1, "week"),
      month: changeFor(history, latest, 1, "month"),
      quarter: changeFor(history, latest, 3, "month"),
      halfYear: changeFor(history, latest, 6, "month"),
      year: changeFor(history, latest, 1, "year"),
      all: changeFor(history, latest, null, null),
    },
  };
}

function trendChange(change) {
  if (!change) return '<span class="text-muted">—</span>';
  return `<span style="color:${colorFor(change.percent)}">${change.percent >= 0 ? "+" : ""}${change.percent.toFixed(2)}%</span>`;
}

function trendSummary(holding) {
  const recent = holding.changes.month || holding.changes.quarter || holding.changes.all;
  if (!recent) return "There is not enough price history to identify a clear trend.";
  const direction = recent.percent > 0 ? "upward" : recent.percent < 0 ? "downward" : "flat";
  const period = recent === holding.changes.month ? "over the past month" : recent === holding.changes.quarter ? "this quarter" : "since the first record";
  const benchmarkText = holding.risk.relative === null
    ? "Benchmark comparison is unavailable."
    : holding.risk.relative >= 0
      ? `It is ahead of the Nifty by ${holding.risk.relative.toFixed(2)} percentage points over the recorded period.`
      : `It is behind the Nifty by ${Math.abs(holding.risk.relative).toFixed(2)} percentage points over the recorded period.`;
  return `The price trend is ${direction} ${period} (${recent.percent >= 0 ? "+" : ""}${recent.percent.toFixed(2)}%). ${benchmarkText}`;
}

function actionFor(holding) {
  const month = holding.changes.month?.percent;
  const quarter = holding.changes.quarter?.percent;
  const relative = holding.risk.relative;
  if (month === undefined || quarter === undefined) return { label: "Hold / monitor", tone: "secondary", detail: "More price history is needed before taking action." };
  if (month < 0 && quarter < 0 && (holding.risk.level === "High" || relative !== null && relative < -5)) {
    return { label: "Review / consider selling", tone: "danger", detail: "Recent momentum and benchmark performance are weak." };
  }
  if (month > 0 && quarter > 0 && relative !== null && relative > 0 && holding.risk.level !== "High") {
    return { label: "Consider buying more", tone: "success", detail: "Momentum and benchmark performance are positive with manageable risk." };
  }
  return { label: "Hold", tone: "primary", detail: month < 0 ? "Short-term weakness suggests waiting for confirmation." : "Performance is mixed; continue monitoring the trend." };
}

function insightCard(title, text, tone = "secondary") {
  return `<div class="col-md-6 col-xl-3"><div class="border-start border-3 border-${tone} bg-light rounded p-3 h-100"><div class="small text-muted">${title}</div><div>${text}</div></div></div>`;
}

function renderInsights(holdings) {
  const bestMomentum = [...holdings].sort((a, b) => (b.changes.month?.percent || -Infinity) - (a.changes.month?.percent || -Infinity))[0];
  const bestOverall = [...holdings].sort((a, b) => (b.changes.all?.percent || -Infinity) - (a.changes.all?.percent || -Infinity))[0];
  const review = holdings.find((holding) => actionFor(holding).tone === "danger");
  const addCandidate = holdings.find((holding) => actionFor(holding).tone === "success");
  const sectorTotals = new Map();
  holdings.forEach((holding) => sectorTotals.set(holding.sector, (sectorTotals.get(holding.sector) || 0) + holding.latest.cur_val));
  const largestSector = [...sectorTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const highRisk = holdings.filter((holding) => holding.risk.level === "High").length;
  const rising = holdings.filter((holding) => holding.changes.month?.percent > 0).length;
  const html = [
    bestMomentum?.changes.month ? insightCard("Best monthly momentum", `${bestMomentum.instrument} · ${bestMomentum.changes.month.percent.toFixed(2)}%`, "success") : "",
    bestOverall?.changes.all ? insightCard("Best since first record", `${bestOverall.instrument} · ${bestOverall.changes.all.percent.toFixed(2)}%`, "success") : "",
    addCandidate ? insightCard("Potential add", `${addCandidate.instrument} · ${actionFor(addCandidate).detail}`, "success") : "",
    review ? insightCard("Needs review", `${review.instrument} · ${actionFor(review).detail}`, "danger") : "",
    largestSector ? insightCard("Largest sector exposure", `${largestSector[0]} · ${formatMoney(largestSector[1])}`, "info") : "",
    insightCard("Monthly breadth", `${rising} of ${holdings.length} holdings rising`, rising >= holdings.length / 2 ? "success" : "warning"),
    insightCard("High-risk holdings", `${highRisk} requiring closer monitoring`, highRisk ? "warning" : "success"),
  ].filter(Boolean).join("");
  document.getElementById("insights").innerHTML = html || '<div class="text-muted">Not enough holding history to generate insights.</div>';
}

function renderMomentumChart(holding, index) {
  const canvas = document.getElementById(`momentum-chart-${index}`);
  if (!canvas || typeof Chart === "undefined") return;
  const points = holding.history.slice(-30);
  const firstPrice = points[0]?.ltp || 0;
  new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: points.map((row) => row.date.format("DD MMM")),
      datasets: [{
        label: "Price momentum",
        data: points.map((row) => firstPrice ? (row.ltp - firstPrice) * 100 / firstPrice : 0),
        borderColor: holding.changes.month?.percent >= 0 ? "#087f23" : "#dc3545",
        backgroundColor: "rgba(8, 127, 35, 0.08)",
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.25,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.parsed.y.toFixed(2)}% from period start` } } },
      scales: { x: { display: false }, y: { ticks: { callback: (value) => `${value}%` }, grid: { color: "rgba(0,0,0,.06)" } } },
    },
  });
}

function renderTrends(holdings) {
  const html = holdings.map((holding) => {
    const riskTone = holding.risk.level === "High" ? "danger" : holding.risk.level === "Medium" ? "warning" : "success";
    const action = actionFor(holding);
    return `<div class="col-md-6 col-xl-4">
      <div class="card h-100 border-${riskTone}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div><h6 class="card-title mb-1">${holding.instrument}</h6><div class="small text-muted">${holding.sector} · Last price ${formatMoney(holding.latest.ltp)} · ${holding.heldDays} days tracked</div></div>
            <span class="badge text-bg-${riskTone}">${holding.risk.level} risk</span>
          </div>
          <div class="d-flex justify-content-between align-items-center mt-3"><span class="badge text-bg-${action.tone}">${action.label}</span><span class="small text-muted">${action.detail}</span></div>
          <p class="small mt-3 mb-3">${trendSummary(holding)}</p>
          <div class="mb-3" style="height:140px"><canvas id="momentum-chart-${holdings.indexOf(holding)}"></canvas></div>
          <div class="row g-2 small mb-3">
            <div class="col-6"><span class="text-muted d-block">Quantity</span><strong>${holding.latest.qty} units</strong></div>
            <div class="col-6"><span class="text-muted d-block">Average cost</span><strong>${formatMoney(holding.latest.avg_cost)}</strong></div>
            <div class="col-6"><span class="text-muted d-block">Current value</span><strong>${formatMoney(holding.latest.cur_val)}</strong></div>
            <div class="col-6"><span class="text-muted d-block">P/L</span><strong style="color:${colorFor(holding.latest.p_l)}">${formatMoney(holding.latest.p_l)} (${holding.returnPercent.toFixed(2)}%)</strong></div>
            <div class="col-6"><span class="text-muted d-block">Held since</span><strong>${formatDate(holding.history[0].date)}</strong></div>
            <div class="col-6"><span class="text-muted d-block">Max drawdown</span><strong style="color:${colorFor(holding.risk.maxDrawdown)}">${holding.risk.maxDrawdown.toFixed(2)}%</strong></div>
          </div>
          <div class="border-top pt-2">
            <div class="small text-muted mb-1">Price change by period</div>
            <div class="row g-2 small">
              <div class="col-4"><span class="text-muted d-block">Day</span><strong>${trendChange(holding.changes.day)}</strong></div>
              <div class="col-4"><span class="text-muted d-block">Week</span><strong>${trendChange(holding.changes.week)}</strong></div>
              <div class="col-4"><span class="text-muted d-block">Month</span><strong>${trendChange(holding.changes.month)}</strong></div>
              <div class="col-4"><span class="text-muted d-block">Quarter</span><strong>${trendChange(holding.changes.quarter)}</strong></div>
              <div class="col-4"><span class="text-muted d-block">Half-year</span><strong>${trendChange(holding.changes.halfYear)}</strong></div>
              <div class="col-4"><span class="text-muted d-block">Year</span><strong>${trendChange(holding.changes.year)}</strong></div>
              <div class="col-4"><span class="text-muted d-block">Since first record</span><strong>${trendChange(holding.changes.all)}</strong></div>
            </div>
          </div>
          <div class="border-top mt-3 pt-2 small">
            <div class="text-muted mb-1">Risk and benchmark</div>
            <div class="row g-2">
              <div class="col-4"><span class="text-muted d-block">Volatility</span><strong>${holding.risk.volatility ? `${holding.risk.volatility.toFixed(2)}%` : "—"}</strong></div>
              <div class="col-4"><span class="text-muted d-block">Beta</span><strong>${holding.risk.beta === null ? "—" : holding.risk.beta.toFixed(2)}</strong></div>
              <div class="col-4"><span class="text-muted d-block">Vs Nifty</span><strong style="color:${colorFor(holding.risk.relative)}">${holding.risk.relative === null ? "—" : `${holding.risk.relative >= 0 ? "+" : ""}${holding.risk.relative.toFixed(2)}%`}</strong></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");
  document.getElementById("stock-trends").innerHTML = html || '<div class="text-muted">No stock trend data available.</div>';
  holdings.forEach((holding, index) => renderMomentumChart(holding, index));
}

function render(data) {
  const holdings = groupHoldings(data.rows).map((holding) => ({ ...decorateHolding(holding), risk: riskMetrics(holding.history, data.benchmarkRows) })).sort((a, b) => b.latest.cur_val - a.latest.cur_val);
  const latestDate = holdings.reduce((date, holding) => holding.latest.date.isAfter(date) ? holding.latest.date : date, dayjs("1900-01-01"));
  const totalCurrent = holdings.reduce((sum, holding) => sum + holding.latest.cur_val, 0);
  const totalInvested = holdings.reduce((sum, holding) => sum + holding.invested, 0);
  const totalProfit = holdings.reduce((sum, holding) => sum + holding.latest.p_l, 0);
  const positive = holdings.filter((holding) => holding.latest.p_l > 0).length;

  document.getElementById("period-label").textContent = `Live stock-level overview · latest data ${formatDate(latestDate)}`;
  document.getElementById("current-value").textContent = formatMoney(totalCurrent);
  document.getElementById("total-invested").textContent = formatMoney(totalInvested);
  document.getElementById("total-profit").textContent = formatMoney(totalProfit);
  document.getElementById("total-profit").style.color = colorFor(totalProfit);
  document.getElementById("total-profit-percent").textContent = totalInvested ? `${(totalProfit * 100 / totalInvested).toFixed(2)}% overall return` : "No cost basis available";
  document.getElementById("holding-count").textContent = String(holdings.length);
  document.getElementById("observations").textContent = `${positive} profitable · ${holdings.length - positive} losing`;
  renderInsights(holdings);
  renderTrends(holdings);
}

async function load() {
  const loading = document.getElementById("loading");
  const error = document.getElementById("error");
  try {
    loading.classList.remove("d-none");
    error.classList.add("d-none");
    cachedData = await getData();
    render(cachedData);
    document.getElementById("last-refreshed").textContent = `Last refreshed ${dayjs().format("DD MMM YYYY, HH:mm:ss")}`;
    loading.classList.add("d-none");
    document.getElementById("statistics-content").classList.remove("d-none");
  } catch (loadError) {
    console.error("Failed to load holdings analysis:", loadError);
    loading.classList.add("d-none");
    error.textContent = `Unable to load holdings analysis: ${loadError.message}`;
    error.classList.remove("d-none");
  }
}

load();

const mysql = require("mysql2/promise");
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
    connectionPromise = mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
  }
  return connectionPromise;
}

async function getData() {
  connection = await createConnection();
  const [rows] = await connection.query(`SELECT h.id, h.date, h.instrument_id, h.qty, h.avg_cost,
    h.ltp, h.cur_val, h.p_l, h.net_chg, h.day_chg, i.name AS instrument
    FROM holdings h INNER JOIN instrument i ON h.instrument_id = i.id
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
    return { instrument: latest.instrument, history, latest, first };
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

function displayChange(change) {
  if (!change) return '<span class="text-muted">—</span>';
  return `<span style="color:${colorFor(change.percent)}" title="${formatMoney(change.value)}">${change.percent >= 0 ? "+" : ""}${change.percent.toFixed(2)}%</span>`;
}

function bestBy(holdings, getter) {
  return holdings
    .filter((holding) => getter(holding) != null && Number.isFinite(getter(holding)))
    .sort((a, b) => getter(b) - getter(a))[0];
}

function insightCard(title, text, tone = "secondary") {
  return `<div class="col-md-6 col-xl-3"><div class="border-start border-3 border-${tone} bg-light rounded p-3 h-100"><div class="small text-muted">${title}</div><div>${text}</div></div></div>`;
}

function renderInsights(holdings) {
  const bestAll = bestBy(holdings, (holding) => holding.changes.all?.percent);
  const bestRecent = bestBy(holdings, (holding) => holding.changes.quarter?.percent);
  const longest = [...holdings].sort((a, b) => b.heldDays - a.heldDays)[0];
  const needsAttention = [...holdings].filter((holding) => holding.latest.p_l < 0).sort((a, b) => a.latest.p_l - b.latest.p_l)[0];
  const largest = [...holdings].sort((a, b) => b.latest.cur_val - a.latest.cur_val)[0];
  const biggestGain = [...holdings].sort((a, b) => b.latest.p_l - a.latest.p_l)[0];
  const mostVolatile = [...holdings].sort((a, b) => {
    const changes = a.history.map((row, index) => index && a.history[index - 1].ltp ? (row.ltp - a.history[index - 1].ltp) / a.history[index - 1].ltp : 0);
    const bChanges = b.history.map((row, index) => index && b.history[index - 1].ltp ? (row.ltp - b.history[index - 1].ltp) / b.history[index - 1].ltp : 0);
    const volatility = (values) => values.length ? Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length) : 0;
    return volatility(bChanges) - volatility(changes);
  })[0];
  const rising = holdings.filter((holding) => holding.changes.month?.percent > 0).length;
  const falling = holdings.filter((holding) => holding.changes.month?.percent < 0).length;
  const html = [
    bestAll ? insightCard("Best since first record", `${bestAll.instrument} · ${bestAll.changes.all.percent.toFixed(2)}%`, "success") : "",
    bestRecent ? insightCard("Best recent momentum", `${bestRecent.instrument} · ${bestRecent.changes.quarter.percent.toFixed(2)}% this quarter`, "success") : "",
    longest ? insightCard("Held the longest", `${longest.instrument} · ${longest.heldDays} days`, "primary") : "",
    needsAttention ? insightCard("Needs attention", `${needsAttention.instrument} · ${formatMoney(needsAttention.latest.p_l)} P/L`, "danger") : "",
    largest ? insightCard("Largest position", `${largest.instrument} · ${formatMoney(largest.latest.cur_val)}`, "info") : "",
    biggestGain ? insightCard("Largest P/L contribution", `${biggestGain.instrument} · ${formatMoney(biggestGain.latest.p_l)}`, "success") : "",
    mostVolatile ? insightCard("Most volatile", `${mostVolatile.instrument} · frequent price swings`, "warning") : "",
    insightCard("Monthly breadth", `${rising} rising · ${falling} falling`, rising >= falling ? "success" : "warning"),
  ].filter(Boolean).join("");
  document.getElementById("insights").innerHTML = html || '<div class="text-muted">Not enough holding history to generate insights.</div>';
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

  document.getElementById("holdings-body").innerHTML = holdings.map((holding) => `<tr>
    <td><strong>${holding.instrument}</strong><div class="small text-muted">${holding.latest.qty} units · ${formatMoney(holding.latest.ltp)} last price</div></td>
    <td>${formatDate(holding.history[0].date)}<div class="small text-muted">${holding.heldDays} days</div></td>
    <td class="text-end">${formatMoney(holding.latest.cur_val)}</td>
    <td class="text-end" style="color:${colorFor(holding.latest.p_l)}">${formatMoney(holding.latest.p_l)}<div class="small">${holding.returnPercent.toFixed(2)}%</div></td>
    <td class="text-end">${displayChange(holding.changes.day)}</td>
    <td class="text-end">${displayChange(holding.changes.week)}</td>
    <td class="text-end">${displayChange(holding.changes.month)}</td>
    <td class="text-end">${displayChange(holding.changes.quarter)}</td>
    <td class="text-end">${displayChange(holding.changes.halfYear)}</td>
    <td class="text-end">${displayChange(holding.changes.year)}</td>
  </tr>`).join("") || '<tr><td colspan="10" class="text-muted">No active holdings data available.</td></tr>';

  const longTerm = holdings.filter((holding) => holding.heldDays >= 365);
  document.getElementById("long-term-body").innerHTML = longTerm.map((holding) => `<tr>
    <td><strong>${holding.instrument}</strong></td>
    <td>${formatDate(holding.history[0].date)}</td>
    <td>${holding.heldDays} days</td>
    <td class="text-end">${formatMoney(holding.latest.cur_val)}</td>
    <td class="text-end" style="color:${colorFor(holding.latest.p_l)}">${formatMoney(holding.latest.p_l)}</td>
    <td class="text-end" style="color:${colorFor(holding.returnPercent)}">${holding.returnPercent.toFixed(2)}%</td>
    <td class="text-end">${displayChange(holding.changes.year)}</td>
  </tr>`).join("") || '<tr><td colspan="7" class="text-muted">No stock has been held for more than one year.</td></tr>';

  const riskBody = document.getElementById("risk-body");
  riskBody.innerHTML = holdings.map((holding) => `<tr>
    <td><strong>${holding.instrument}</strong></td>
    <td><span class="badge text-bg-${holding.risk.level === "High" ? "danger" : holding.risk.level === "Medium" ? "warning" : "success"}">${holding.risk.level}</span></td>
    <td class="text-end">${holding.risk.volatility ? `${holding.risk.volatility.toFixed(2)}%` : "—"}</td>
    <td class="text-end" style="color:${colorFor(holding.risk.maxDrawdown)}">${holding.risk.maxDrawdown.toFixed(2)}%</td>
    <td class="text-end">${holding.risk.beta === null ? "—" : holding.risk.beta.toFixed(2)}</td>
    <td class="text-end">${holding.risk.stockReturn === null ? "—" : `${holding.risk.stockReturn >= 0 ? "+" : ""}${holding.risk.stockReturn.toFixed(2)}%`}</td>
    <td class="text-end">${holding.risk.marketReturn === null ? "—" : `${holding.risk.marketReturn >= 0 ? "+" : ""}${holding.risk.marketReturn.toFixed(2)}%`}</td>
    <td class="text-end" style="color:${colorFor(holding.risk.relative)}">${holding.risk.relative === null ? "—" : `${holding.risk.relative >= 0 ? "+" : ""}${holding.risk.relative.toFixed(2)}%`}</td>
    <td>${holding.risk.relative !== null && holding.risk.relative < 0 ? "Underperforming Nifty" : "Outperforming / unavailable"}</td>
  </tr>`).join("") || '<tr><td colspan="9" class="text-muted">No risk data available.</td></tr>';
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

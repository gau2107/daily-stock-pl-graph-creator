const mysql = (typeof require === 'function') ? require('mysql2/promise') : null;

const DEFAULT_DEMO_PORTFOLIO = [
  { symbol: 'AAPL', shares: 10, costBasis: 1200, currentPrice: 150 },
  { symbol: 'MSFT', shares: 5, costBasis: 600, currentPrice: 320 },
  { symbol: 'GOOGL', shares: 2, costBasis: 400, currentPrice: 1400 },
  { symbol: 'TSLA', shares: 3, costBasis: 1800, currentPrice: 900 },
  { symbol: 'AMZN', shares: 1, costBasis: 3100, currentPrice: 3500 },
];

function formatCurrency(n) {
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
}
function formatPct(n) {
  return (n * 100).toFixed(2) + '%';
}

// Chart instances
let allocationChart = null;
let performanceChart = null;



// Render rows from a portfolio array
function renderRows(portfolio) {
  const tbody = document.getElementById('pg-tbody');
  tbody.innerHTML = '';
  const filter = (document.getElementById('pg-filter')?.value || '').toLowerCase();
  const sortBy = document.getElementById('pg-sort-by')?.value || 'symbol';
  const sortOrder = document.getElementById('pg-sort-order')?.value || 'desc';

  // compute currentValue and return percentage for each row
  const totalPortfolioValue = portfolio.reduce((sum, p) => sum + (Number(p.currentPrice) || 0) * (Number(p.shares) || 0), 0);

  const list = portfolio.map((p, idx) => {
    const currentValue = (Number(p.currentPrice) || 0) * (Number(p.shares) || 0);
    const returnPct = p.costBasis === 0 ? 0 : (currentValue - p.costBasis) / p.costBasis;
    const weight = totalPortfolioValue === 0 ? 0 : (currentValue / totalPortfolioValue) * 100;
    return { ...p, currentValue, returnPct, weight, _idx: idx };
  })
    .filter(p => !filter || p.symbol.toLowerCase().includes(filter))
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'symbol') cmp = a.symbol.localeCompare(b.symbol);
      else if (sortBy === 'currentValue') cmp = a.currentValue - b.currentValue;
      else if (sortBy === 'return') cmp = a.returnPct - b.returnPct;
      return sortOrder === 'asc' ? cmp : -cmp;
    });

  list.forEach((p, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'align-middle';

    // Logo cell with better styling
    const logoTd = document.createElement('td');
    const logo = document.createElement('div');
    logo.textContent = p.symbol.slice(0, 2).toUpperCase();
    logo.className = 'stock-logo';
    logo.style.background = `hsl(${(idx * 47) % 360} 60% 70%)`;
    logo.style.color = 'white';
    logoTd.appendChild(logo);
    tr.appendChild(logoTd);

    // Checkbox cell
    const checkboxTd = document.createElement('td');
    checkboxTd.className = 'text-center';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'form-check-input';
    cb.checked = true;
    cb.dataset.idx = p._idx;
    checkboxTd.appendChild(cb);
    tr.appendChild(checkboxTd);

    // Symbol cell with better formatting
    const symbolTd = document.createElement('td');
    symbolTd.innerHTML = `<strong>${p.symbol}</strong>`;
    tr.appendChild(symbolTd);

    // Shares cell with editable input
    const sharesTd = document.createElement('td');
    sharesTd.className = 'text-end';
    const sharesInput = document.createElement('input');
    sharesInput.type = 'number';
    sharesInput.step = '1';
    sharesInput.min = '0';
    sharesInput.value = p.shares;
    sharesInput.className = 'shares-input';
    sharesInput.dataset.idx = p._idx;
    sharesTd.appendChild(sharesInput);
    tr.appendChild(sharesTd);

    // Average cost cell (should remain constant)
    const costTd = document.createElement('td');
    costTd.className = 'text-end';
    const originalAvgCost = p.shares > 0 ? p.costBasis / p.shares : 0;
    costTd.textContent = formatCurrency(originalAvgCost);
    tr.appendChild(costTd);

    // Current price cell (read-only)
    const priceTd = document.createElement('td');
    priceTd.className = 'text-end';
    priceTd.textContent = formatCurrency(p.currentPrice);
    tr.appendChild(priceTd);

    // Current value cell
    const curValTd = document.createElement('td');
    curValTd.className = 'text-end fw-bold';
    curValTd.textContent = formatCurrency(p.currentValue);
    tr.appendChild(curValTd);

    // Return cell with color coding
    const retTd = document.createElement('td');
    retTd.className = 'text-end fw-bold';
    const returnClass = p.returnPct >= 0 ? 'positive' : 'negative';
    const returnIcon = p.returnPct >= 0 ? '↗' : '↘';
    retTd.innerHTML = `<span class="${returnClass}">${returnIcon} ${formatPct(p.returnPct)}</span>`;
    tr.appendChild(retTd);

    // Weight cell
    const weightTd = document.createElement('td');
    weightTd.className = 'text-end text-muted';
    weightTd.textContent = p.weight.toFixed(1) + '%';
    tr.appendChild(weightTd);


    tbody.appendChild(tr);

    // listeners
    cb.addEventListener('change', recompute);
    sharesInput.addEventListener('input', (e) => {
      const i = Number(e.target.dataset.idx);
      const newShares = parseInt(e.target.value) || 0;

      // Update shares in portfolio
      portfolio[i].shares = newShares;

      // Update cost basis based on new shares * original average cost
      // This keeps the average cost constant while adjusting total cost basis
      portfolio[i].costBasis = newShares * originalAvgCost;

      // Update current value and return
      const newCurValue = portfolio[i].currentPrice * newShares;
      curValTd.textContent = formatCurrency(newCurValue);
      const newReturnPct = portfolio[i].costBasis === 0 ? 0 : (newCurValue - portfolio[i].costBasis) / portfolio[i].costBasis;
      const returnClass = newReturnPct >= 0 ? 'positive' : 'negative';
      const returnIcon = newReturnPct >= 0 ? '↗' : '↘';
      retTd.innerHTML = `<span class="${returnClass}">${returnIcon} ${formatPct(newReturnPct)}</span>`;

      recompute();
    });
  });

  // attach control buttons
  document.getElementById('pg-select-all').onclick = () => {
    document.querySelectorAll('#pg-tbody input[type="checkbox"]').forEach(cb => cb.checked = true);
    recompute();
  };
  document.getElementById('pg-clear').onclick = () => {
    document.querySelectorAll('#pg-tbody input[type="checkbox"]').forEach(cb => cb.checked = false);
    recompute();
  };


  // attach filter / sort listeners to re-render on change
  document.getElementById('pg-filter').oninput = () => renderRows(portfolio);
  document.getElementById('pg-sort-by').onchange = () => renderRows(portfolio);
  document.getElementById('pg-sort-order').onchange = () => renderRows(portfolio);

  // initial compute
  recompute();

  function recompute() {
    const rows = Array.from(document.querySelectorAll('#pg-tbody tr'));
    let selectedCount = 0;
    let totalCost = 0;
    let totalCurrent = 0;
    const selectedHoldings = [];

    rows.forEach((tr) => {
      const cb = tr.querySelector('input[type="checkbox"]');
      if (cb && cb.checked) {
        selectedCount++;
        const p = portfolio[Number(cb.dataset.idx)];
        totalCost += p.costBasis;
        totalCurrent += p.currentPrice * p.shares;
        selectedHoldings.push({
          symbol: p.symbol,
          value: p.currentPrice * p.shares,
          return: p.costBasis === 0 ? 0 : ((p.currentPrice * p.shares) - p.costBasis) / p.costBasis
        });
      }
    });

    const pct = totalCost === 0 ? 0 : (totalCurrent - totalCost) / totalCost;
    const returnAmount = totalCurrent - totalCost;

    // Update summary cards
    document.getElementById('pg-selected-count').textContent = String(selectedCount);
    document.getElementById('pg-total-cost').textContent = totalCost ? formatCurrency(totalCost) : '-';
    document.getElementById('pg-total-current').textContent = totalCurrent ? formatCurrency(totalCurrent) : '-';

    const returnElement = document.getElementById('pg-portfolio-return');
    if (totalCost) {
      const returnClass = pct >= 0 ? 'positive' : 'negative';
      const returnIcon = pct >= 0 ? '↗' : '↘';
      returnElement.innerHTML = `<span class="${returnClass}">${returnIcon} ${formatPct(pct)}</span><br><small>(${formatCurrency(returnAmount)})</small>`;
    } else {
      returnElement.textContent = '-';
    }

    // Update header total
    document.getElementById('header-total-value').textContent = formatCurrency(totalCurrent);

    // Update charts
    updateCharts(selectedHoldings);
  }
}

// Fetch portfolio from DB similar to other renderer files. Returns array of {symbol, shares, costBasis, currentPrice}
async function fetchPortfolioFromDB() {
  if (!mysql) throw new Error('mysql not available');
  // Try to connect using env variables if available. This mirrors other renderers.
  const dotenv = require('dotenv');
  const path = require('path');
  const envFilePath = process.env.NODE_ENV === 'development' ? '.env.local' : '.env.production';
  dotenv.config({ path: path.resolve(__dirname, envFilePath) });

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  // Query latest snapshot per instrument: return the most recent holding row for each instrument
  // This gives a single row per active instrument containing current qty, cost basis and ltp.
  const [rows] = await connection.query(
    `SELECT i.name AS symbol, h.qty AS shares, (h.avg_cost * h.qty) AS costBasis, h.ltp AS currentPrice
     FROM holdings h
     INNER JOIN instrument i ON h.instrument_id = i.id
     WHERE h.id IN (SELECT MAX(id) FROM holdings GROUP BY instrument_id)
       AND i.is_active = TRUE`);

  await connection.end();
  return rows.map(r => ({ symbol: r.symbol, shares: Number(r.shares) || 0, costBasis: Number(r.costBasis) || 0, currentPrice: Number(r.currentPrice) || 0 }));
}

// Entry point: mount and attempt to load live portfolio, fallback to demo
async function mountPlayground() {
  const root = document.getElementById('playground-root') || document.getElementById('root') || document.body;
  root.style.fontFamily = 'system-ui, Arial, sans-serif';

  // Page markup is provided by playground.html; start with demo portfolio as fallback
  let portfolio = DEFAULT_DEMO_PORTFOLIO.slice();
  try {
    const dbPortfolio = await fetchPortfolioFromDB();
    if (dbPortfolio && dbPortfolio.length) portfolio = dbPortfolio;
  } catch (err) {
    console.info('playground: could not load portfolio from DB, using demo data', err?.message || err);
  }

  // Ensure numeric fields exist on portfolio items
  portfolio = portfolio.map(p => ({ symbol: p.symbol, shares: Number(p.shares) || 0, costBasis: Number(p.costBasis) || 0, currentPrice: Number(p.currentPrice) || 0 }));

  renderRows(portfolio);

  // Initialize empty charts
  updateCharts([]);
}

// Auto-mount
mountPlayground();

// Chart functions
function updateCharts(selectedHoldings) {
  updateAllocationChart(selectedHoldings);
  updatePerformanceChart(selectedHoldings);
}

function updateAllocationChart(holdings) {
  const ctx = document.getElementById('allocation-chart');
  if (!ctx) return;

  if (allocationChart) {
    allocationChart.destroy();
  }

  if (holdings.length === 0) {
    allocationChart = null;
    return;
  }

  const colors = holdings.map((_, idx) => `hsl(${(idx * 47) % 360} 60% 70%)`);

  allocationChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: holdings.map(h => h.symbol),
      datasets: [{
        data: holdings.map(h => h.value),
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 15,
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((context.parsed / total) * 100).toFixed(1);
              return `${context.label}: ${formatCurrency(context.parsed)} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

function updatePerformanceChart(holdings) {
  const ctx = document.getElementById('performance-chart');
  if (!ctx) return;

  if (performanceChart) {
    performanceChart.destroy();
  }

  if (holdings.length === 0) {
    performanceChart = null;
    return;
  }

  const colors = holdings.map(h => h.return >= 0 ? '#28a745' : '#dc3545');

  performanceChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: holdings.map(h => h.symbol),
      datasets: [{
        label: 'Return %',
        data: holdings.map(h => h.return * 100),
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return `Return: ${context.parsed.y.toFixed(2)}%`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function (value) {
              return value + '%';
            }
          }
        }
      }
    }
  });
}
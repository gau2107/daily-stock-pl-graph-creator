const mysql = (typeof require === 'function') ? require('mysql2/promise') : null;

function formatCurrency(n) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}
function formatPct(n) {
  return (n * 100).toFixed(2) + '%';
}

// Create minimal static markup inside the playground root
function renderStaticMarkup(root) {
  root.innerHTML = `
    <h2>Portfolio playground</h2>
    <div id="pg-controls" style="margin-bottom:12px">
      <button id="pg-select-all" class="btn btn-sm btn-outline-primary">Select All</button>
      <button id="pg-clear" class="btn btn-sm btn-outline-secondary" style="margin-left:8px">Clear</button>
    </div>
    <div style="overflow:auto">
      <table id="pg-table" class="table table-sm" style="min-width:720px;width:100%;">
        <thead>
          <tr>
            <th>Include</th>
            <th>Symbol</th>
            <th style="text-align:right">Shares</th>
            <th style="text-align:right">Cost Basis</th>
            <th style="text-align:right">Current Price</th>
            <th style="text-align:right">Current Value</th>
            <th style="text-align:right">Return</th>
          </tr>
        </thead>
        <tbody id="pg-tbody"></tbody>
      </table>
    </div>
    <div id="pg-summary" style="margin-top:12px">
      <div><strong>Selected holdings:</strong> <span id="pg-selected-count">0</span></div>
      <div>Total cost: <span id="pg-total-cost">-</span></div>
      <div>Total current value: <span id="pg-total-current">-</span></div>
      <div>Portfolio return: <span id="pg-portfolio-return">-</span></div>
    </div>
  `;
}

// Render rows from a portfolio array
function renderRows(portfolio) {
  const tbody = document.getElementById('pg-tbody');
  tbody.innerHTML = '';
  portfolio.forEach((p, idx) => {
    const tr = document.createElement('tr');
    tr.style.borderTop = '1px solid #eee';

    const checkboxTd = document.createElement('td');
    checkboxTd.style.padding = '6px 4px';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.idx = idx;
    checkboxTd.appendChild(cb);
    tr.appendChild(checkboxTd);

    const symbolTd = document.createElement('td');
    symbolTd.textContent = p.symbol;
    tr.appendChild(symbolTd);

    const sharesTd = document.createElement('td');
    sharesTd.style.textAlign = 'right';
    sharesTd.textContent = p.shares;
    tr.appendChild(sharesTd);

    const costTd = document.createElement('td');
    costTd.style.textAlign = 'right';
    costTd.textContent = formatCurrency(p.costBasis);
    tr.appendChild(costTd);

    const priceTd = document.createElement('td');
    priceTd.style.textAlign = 'right';
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.step = '0.01';
    priceInput.value = p.currentPrice;
    priceInput.style.width = '90px';
    priceInput.dataset.idx = idx;
    priceTd.appendChild(priceInput);
    tr.appendChild(priceTd);

    const curValTd = document.createElement('td');
    curValTd.style.textAlign = 'right';
    const curValue = p.currentPrice * p.shares;
    curValTd.textContent = formatCurrency(curValue);
    tr.appendChild(curValTd);

    const retTd = document.createElement('td');
    retTd.style.textAlign = 'right';
    const retPct = p.costBasis === 0 ? 0 : (curValue - p.costBasis) / p.costBasis;
    retTd.textContent = formatPct(retPct);
    tr.appendChild(retTd);

    tbody.appendChild(tr);

    // listeners
    cb.addEventListener('change', recompute);
    priceInput.addEventListener('input', (e) => {
      const i = Number(e.target.dataset.idx);
      const val = parseFloat(e.target.value) || 0;
      portfolio[i].currentPrice = val;
      const newCurValue = val * portfolio[i].shares;
      curValTd.textContent = formatCurrency(newCurValue);
      retTd.textContent = formatPct((newCurValue - portfolio[i].costBasis) / portfolio[i].costBasis);
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

  // initial compute
  recompute();

  function recompute() {
    const rows = Array.from(document.querySelectorAll('#pg-tbody tr'));
    let selectedCount = 0;
    let totalCost = 0;
    let totalCurrent = 0;
    rows.forEach((tr) => {
      const cb = tr.querySelector('input[type="checkbox"]');
      if (cb && cb.checked) {
        selectedCount++;
        const p = portfolio[Number(cb.dataset.idx)];
        totalCost += p.costBasis;
        totalCurrent += p.currentPrice * p.shares;
      }
    });
    const pct = totalCost === 0 ? 0 : (totalCurrent - totalCost) / totalCost;
    document.getElementById('pg-selected-count').textContent = String(selectedCount);
    document.getElementById('pg-total-cost').textContent = totalCost ? formatCurrency(totalCost) : '-';
    document.getElementById('pg-total-current').textContent = totalCurrent ? formatCurrency(totalCurrent) : '-';
    document.getElementById('pg-portfolio-return').textContent = totalCost ? formatPct(pct) + ` (${formatCurrency(totalCurrent - totalCost)})` : '-';
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

  // Query latest holdings aggregated by instrument. Adapt as needed for your schema.
  const [rows] = await connection.query(
    `SELECT i.name AS symbol, SUM(h.qty) AS shares, SUM(h.avg_cost * h.qty) AS costBasis, AVG(h.ltp) AS currentPrice
     FROM holdings h
     INNER JOIN instrument i ON h.instrument_id = i.id
     WHERE i.is_active = TRUE
     GROUP BY i.name`);

  await connection.end();
  return rows.map(r => ({ symbol: r.symbol, shares: Number(r.shares) || 0, costBasis: Number(r.costBasis) || 0, currentPrice: Number(r.currentPrice) || 0 }));
}

// Entry point: mount and attempt to load live portfolio, fallback to demo
async function mountPlayground() {
  const root = document.getElementById('playground-root') || document.getElementById('root') || document.body;
  root.style.fontFamily = 'system-ui, Arial, sans-serif';
  root.style.maxWidth = '760px';
  root.style.margin = '18px';

  renderStaticMarkup(root);

  let portfolio = [];
  try {
    const dbPortfolio = await fetchPortfolioFromDB();
    if (dbPortfolio && dbPortfolio.length) portfolio = dbPortfolio;
  } catch (err) {
    console.info('playground: could not load portfolio from DB, using demo data', err?.message || err);
  }

  // Ensure numeric fields exist on portfolio items
  portfolio = portfolio.map(p => ({ symbol: p.symbol, shares: Number(p.shares) || 0, costBasis: Number(p.costBasis) || 0, currentPrice: Number(p.currentPrice) || 0 }));

  renderRows(portfolio);
}

// Auto-mount
mountPlayground();

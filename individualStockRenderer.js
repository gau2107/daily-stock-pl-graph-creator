const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");
const dayjs = require("dayjs");
const { getRandomColor } = require("./src/utils/utils");

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });

let connection;

async function initConnection() {
  connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
}

async function getData(startDate, endDate) {
  Chart.helpers.each(Chart.instances, function (instance) {
    instance.destroy();
  });
  var parentElement = document.getElementById('container'); // Replace with the actual ID of your parent element
  while (parentElement.firstChild) {
    parentElement.removeChild(parentElement.firstChild);
  }

  let [rows] =
    await connection.query(`
      SELECT h.id, h.date, h.qty, h.avg_cost, h.ltp, h.cur_val, h.p_l, h.net_chg, 
      h.day_chg, i.name AS instrument, i.sector_id
      FROM holdings AS h 
      INNER JOIN instrument AS i ON h.instrument_id = i.id 
      WHERE h.date > '${startDate.format('YYYY-MM-DD')}' 
      AND h.date < '${endDate.format('YYYY-MM-DD')}' 
      AND i.is_active = true ORDER BY h.date, i.name;`
    );
  generateDataForChart(rows);
}

async function generateDataForChart(rows) {
  const dates = [...new Set(rows.map((row) => dayjs(row.date).format("YYYY-MM-DD")))];
  const values = [];
  rows.forEach((row) => {
    let value = values.find((item) => item.instrument === row.instrument);
    if (!value) {
      value = { instrument: row.instrument, dates: [], data: [], day_chg: [], color: getRandomColor(), firstPrice: Number(row.ltp) || 0 };
      values.push(value);
    }
    const price = Number(row.ltp) || 0;
    const previous = value.data.length ? value.lastPrice : price;
    value.dates.push(dayjs(row.date).format("YYYY-MM-DD"));
    value.day_chg.push(previous ? ((price - previous) * 100) / previous : 0);
    value.data.push(value.firstPrice ? ((price - value.firstPrice) * 100) / value.firstPrice : 0);
    value.lastPrice = price;
  });
  const [niftyData] = await connection.query(
    "SELECT date, nifty_50 FROM daily_pl WHERE date >= ? AND date <= ? ORDER BY date",
    [dates[0], dates[dates.length - 1]]
  );
  const niftyByDate = new Map(niftyData.map((row) => [dayjs(row.date).format("YYYY-MM-DD"), Number(row.nifty_50) || 0]));
  values.forEach((value) => {
    generateChart(value.dates.map((date) => new Date(date).toDateString()), value, niftyByDate);
  });
}

function generateChart(dates, value, niftyByDate) {
  const firstNifty = value.dates.map((date) => niftyByDate.get(date)).find((benchmark) => benchmark);
  const finalData = value.dates.map((date) => {
    const benchmarkValue = niftyByDate.get(date);
    return firstNifty && benchmarkValue ? ((benchmarkValue - firstNifty) * 100) / firstNifty : null;
  });
  function colors(opacity) {
    return value.day_chg.map((day_chg) =>
      day_chg < 0
        ? `rgba(255, 110, 100, ${opacity})`
        : `rgba(0, 125, 10, ${opacity})`
    );
  }
  let barLabel = `(${((value.day_chg.filter(day_chg => day_chg > 0).length * 100) / value.day_chg.length).toFixed(2)}%)`
  let lineLabel = `(${value.data[value.data.length - 1].toFixed(2)}%)`
  const data = {
    labels: dates,
    datasets: [
      {
        label: value.instrument + lineLabel,
        data: value.data,
        backgroundColor: value.color,
        borderColor: value.color,
        pointStyle: false,
        tension: .2
      },
      {
        type: "bar",
        label: value.instrument + barLabel,
        data: value.day_chg,
        borderColor: colors(1),
        backgroundColor: colors(0.5),

        borderWidth: 1,
      },
      {
        label: `Nifty 50 (${finalData[finalData.length - 1] === null ? "—" : finalData[finalData.length - 1].toFixed(2)}%)`,
        data: finalData,
        backgroundColor: "rgba(200, 100, 100, .5)",
        borderColor: "rgba(200, 100, 100, 1)",
        pointStyle: false,
        tension: .2
      },
    ],
  };
  const config = {
    type: "line",
    data: data,
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "top",
        },
      },
    },
  };
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  new Chart(ctx, config);
  const container = document.getElementById("container");
  container.appendChild(canvas);
}

const filterBtn = document.getElementById("filter");
filterBtn.addEventListener("click", async () => {
  const startDate = document.getElementById("start-date").value;
  const endDate = document.getElementById("end-date").value;
  if (!startDate || !endDate) return;
  getData(dayjs(startDate), dayjs(endDate))

});

// Ensure connection is established before calling getData
initConnection().then(() => {
  getData(dayjs().subtract(3, 'months'), dayjs());
});

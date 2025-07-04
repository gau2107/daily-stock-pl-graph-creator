const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");
const dayjs = require("dayjs");
const { getRandomColor } = require("./src/utils/utils");

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });

let connection;
(async function initConnection() {
  connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
})();

async function getData(startDate, endDate) {
  Chart.helpers.each(Chart.instances, function (instance) {
    instance.destroy();
  });
  var parentElement = document.getElementById('container'); // Replace with the actual ID of your parent element
  while (parentElement.firstChild) {
    parentElement.removeChild(parentElement.firstChild);
  }

  [rows] =
    await connection.query(`
      SELECT h.id, h.date, h.qty, h.avg_cost, h.ltp, h.cur_val, h.p_l, h.net_chg, 
      h.day_chg, i.name AS instrument, i.sector_id
      FROM holdings AS h 
      INNER JOIN instrument AS i ON h.instrument_id = i.id 
      WHERE h.date > '${startDate.format('YYYY-MM-DD')}' 
      AND h.date < '${endDate.format('YYYY-MM-DD')}' 
      AND i.is_active = true;`
    );

  generateDataForChart(rows);
}

async function generateDataForChart(rows) {
  let dates = [];
  let values = [];
  for (let i = 0; i < rows.length; i++) {
    let foundIndex = dates.findIndex(
      (v) => new Date(v).getTime() === new Date(rows[i].date).getTime()
    );
    if (foundIndex >= 0) {
    } else {
      dates.push(rows[i].date);
    }
    let find = values.findIndex((v) => v.instrument === rows[i].instrument);
    if (find >= 0) {
      values[find].day_chg.push(parseFloat(rows[i].day_chg));
      values[find].data.push(
        parseFloat(values[find].data[values[find].data.length - 1]) +
        parseFloat(rows[i].day_chg)
      );
    } else {
      values.push({
        instrument: rows[i].instrument,
        data: [parseFloat(rows[i].day_chg)],
        day_chg: [parseFloat(rows[i].day_chg)],
        color: getRandomColor(),
      });
    }
  }
  dates = dates.map((data) => new Date(data).toDateString());
  [niftyData] = await connection.query(
    `SELECT nifty_50 FROM daily_pl ORDER BY id DESC LIMIT ${dates.length};`
  );
  let finalNiftyData = [...niftyData.reverse()];

  for (let i = 0; i < values.length; i++)
    generateChart(dates, values[i], finalNiftyData);
}

function generateChart(dates, value, niftyRows) {
  let index = niftyRows.length - value.data.length;
  let finalData = niftyRows.map(
    (s) => ((s.nifty_50 - niftyRows[index].nifty_50) * 100) / niftyRows[index].nifty_50
  );
  if (value.data.length < dates.length) {
    dates = dates.slice(dates.length - value.data.length);
    finalData = finalData.slice(finalData.length - value.data.length);
  }
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
        label: "Nifty 50",
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
getData(dayjs().subtract(3, 'months'), dayjs());

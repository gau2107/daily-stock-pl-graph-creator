const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");
const { ipcRenderer } = require("electron");

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });
const dbConnectionString = process.env.DB_CONNECTION_STRING;

let totalInstruments;
ipcRenderer.send("get-total-instruments");

ipcRenderer.on("total-instruments", (event, data) => {
  totalInstruments = data;
});
let connection;
async function getData() {
  connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: dbConnectionString,
  });

  [rows] =
    await connection.query(`SELECT h.id, h.date, h.qty, h.avg_cost, h.ltp, h.cur_val, h.p_l, h.net_chg, h.day_chg, i.name AS instrument, i.sector_id
  FROM holdings AS h INNER JOIN instrument AS i ON h.instrument_id = i.id;`);

  generateDataForChart(rows);
}
function getRandomColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
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
  [stockRows] = await connection.query(
    `SELECT nifty_50 FROM daily_pl ORDER BY id DESC LIMIT ${dates.length};`
  );
  let stockData = [...stockRows.reverse()];
  let finalData = stockData.map(
    (s) => ((s.nifty_50 - stockData[0].nifty_50) * 100) / stockData[0].nifty_50
  );
  for (let i = 0; i < values.length; i++)
    generateChart(dates, values[i], finalData);
}

function generateChart(dates, value, stockRows) {
  if (value.data.length < dates.length)
    dates = dates.slice(dates.length - value.data.length);
  function colors(opacity) {
    return value.day_chg.map((day_chg) =>
      day_chg < 0
        ? `rgba(255, 110, 100, ${opacity})`
        : `rgba(0, 125, 10, ${opacity})`
    );
  }
  const data = {
    labels: dates,
    datasets: [
      {
        label: value.instrument,
        data: value.data,
        backgroundColor: value.color,
        borderColor: value.color,
        borderWidth: 1,
      },
      {
        type: "bar",
        label: value.instrument + " Day change",
        data: value.day_chg,
        borderColor: colors(1),
        backgroundColor: colors(0.5),

        borderWidth: 1,
      },
      {
        label: "Nifty 50",
        data: stockRows,
        backgroundColor: "rgba(200, 100, 100, .5)",
        borderColor: "rgba(200, 100, 100, 1)",
        borderWidth: 1,
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
getData();

const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });
const dbConnectionString = process.env.DB_CONNECTION_STRING;

async function getData() {
  const connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: dbConnectionString,
  });

  [rows] = await connection.query("SELECT * FROM holdings;");
  [stockRows] = await connection.query(
    `SELECT nifty_50 FROM daily_pl ORDER BY id DESC LIMIT ${rows.length / 15};`
  );
  let stockData = [...stockRows.reverse()];
  let xx = stockData.map(
    (s) => ((s.nifty_50 - stockData[0].nifty_50) * 100) / stockData[0].nifty_50
  );
  x(rows, xx);
}
function getRandomColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

function x(rows, stockRows) {
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
      values[find].data.push(
        parseFloat(values[find].data[values[find].data.length - 1]) +
          parseFloat(rows[i].day_chg)
      );
    } else {
      values.push({
        instrument: rows[i].instrument,
        data: [parseFloat(rows[i].day_chg)],
        color: getRandomColor(),
      });
    }
  }
  dates = dates.map((data) => new Date(data).toDateString());

  for (let i = 0; i < values.length; i++) chart(dates, values[i], stockRows);
}

function chart(dates, value, stockRows) {
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

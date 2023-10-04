const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });
const dbConnectionString = process.env.DB_CONNECTION_STRING;

let connection;
async function getData() {
  connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: dbConnectionString,
  });

  [rows] = await connection.query(`SELECT
    s.name AS sector_name,
    i.name AS instrument_name,
    h.date,
    h.qty,
    h.avg_cost,
    h.ltp,
    h.cur_val,
    h.p_l,
    h.net_chg,
    h.day_chg
FROM
    sector AS s
INNER JOIN instrument AS i
ON
    s.id = i.sector_id
INNER JOIN holdings AS h
ON
    i.id = h.instrument_id where i.is_active = true;`);

  let sectorGroupArray = [];
  rows.forEach((product) => {
    // find by sector
    let x = sectorGroupArray.findIndex((p) => p.sector === product.sector_name);
    if (x >= 0) {
      //true
      // find by instrument
      let y = sectorGroupArray[x].instruments.findIndex(
        (p) => p.instrument === product.instrument_name
      );
      if (y >= 0) {
        //true
        sectorGroupArray[x].instruments[y].data.push({
          cur_val: product.cur_val,
          p_l: product.p_l,
          date: product.date,
          net_chg: product.net_chg,
          day_chg: product.day_chg,
        });
      } else {
        //new instrument
        sectorGroupArray[x].instruments.push({
          instrument: product.instrument_name,
          data: [
            {
              cur_val: product.cur_val,
              p_l: product.p_l,
              date: product.date,
              net_chg: product.net_chg,
              day_chg: product.day_chg,
            },
          ],
        });
      }
      sectorGroupArray[x].net_percent = sectorGroupArray[x].instruments.reduce(
        (acc, instrument) =>
          parseFloat(instrument.data[instrument.data.length - 1].net_chg) + acc,
        0
      );
      sectorGroupArray[x].p_l = sectorGroupArray[x].instruments.reduce(
        (acc, instrument) =>
          parseFloat(instrument.data[instrument.data.length - 1].p_l) + acc,
        0
      );
      sectorGroupArray[x].cur_val = sectorGroupArray[x].instruments.reduce(
        (acc, instrument) =>
          parseFloat(instrument.data[instrument.data.length - 1].cur_val) + acc,
        0
      );

      sectorGroupArray[x].net_percent =
        sectorGroupArray[x].net_percent.toFixed(2);
      sectorGroupArray[x].p_l = sectorGroupArray[x].p_l.toFixed(2);
      sectorGroupArray[x].cur_val = sectorGroupArray[x].cur_val.toFixed(2);
    } else {
      // new sector
      sectorGroupArray.push({
        sector: product.sector_name,
        instruments: [
          {
            instrument: product.instrument_name,
            data: [
              {
                cur_val: product.cur_val,
                p_l: product.p_l,
                date: product.date,
                net_chg: product.net_chg,
                day_chg: product.day_chg,
              },
            ],
          },
        ],
        net_percent: product.net_chg,
        p_l: product.p_l,
        cur_val: product.cur_val,
      });
    }
  });

  let neww = JSON.parse(JSON.stringify(sectorGroupArray));

  neww.forEach((x) => {
    x.graph = [];
    x.dates = [];
    x.instrumentNames = [];
    let len = 0;
    x.instruments.map((c, parentIndex) => {
      len = c.data.length > len ? c.data.length : len;
      if (c.data.length < len) {
        let f = len - c.data.length;
        let temp = { cur_val: 0, net_chg: 0 };
        for (let i = 0; i < f; i++) {
          c.data.unshift(temp);
        }
      }
      c.data.map((v, index) => {
        if (parentIndex === 0) {
          x.graph.push(parseFloat(v.net_chg));
          x.dates.push(new Date(v.date).toDateString());
          v.color = getRandomColor();
        } else
          x.graph[index] = (
            parseFloat(x.graph[index]) + parseFloat(v.net_chg)
          ).toFixed(2);
      });
      x.instrumentNames.push(c.instrument);
    });
    x.color = getRandomColor();
  });

  let len = neww[0].graph.length;
  [stockRows] = await connection.query(
    `SELECT nifty_50 FROM daily_pl ORDER BY id DESC LIMIT ${len};`
  );
  [firstNifty] = await connection.query(
    `SELECT nifty_50 FROM daily_pl WHERE id = 1;`
  );
  let stockData = [...stockRows.reverse()];
  let finalData = stockData.map(
    (s) =>
      ((s.nifty_50 - firstNifty[0].nifty_50) * 100) / firstNifty[0].nifty_50
  );
  for (let i = 0; i < neww.length; i++) {
    generateChart(neww[i], finalData);
  }
  doughnutChart(neww);
  compareChart(neww);
}

function doughnutChart(neww) {
  const labels = neww.map((item) => item.sector);
  const values = neww.map((item) => parseInt(item.cur_val));
  const data = {
    labels: labels,
    datasets: [
      {
        data: values,
        backgroundColor: neww.map((item) => item.color),
        borderColor: neww.map((item) => item.color),
        borderWidth: 1,
      },
    ],
  };
  const config = {
    type: "doughnut",
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: 98,
      plugins: {
        legend: {
          position: "top",
        },
        title: {
          display: true,
          text: "Holdings doughnut",
        },
      },
    },
  };

  const chartCanvas = document.getElementById("doughnut-chart");
  new Chart(chartCanvas, config);
}
function compareChart(neww) {
  const labels = neww.map((item) => item.sector);
  const values = neww.map((item) => item.cur_val);
  const values1 = neww.map(
    (item) => parseFloat(item.cur_val) - parseFloat(item.p_l)
  );
  const data = {
    labels: labels,
    datasets: [
      {
        label: "Invested value",
        data: values1,
        backgroundColor: "rgba(41, 128, 185, .5)",
        borderColor: "rgba(41, 128, 185, 1)",
        borderWidth: 1,
      },
      {
        label: "Current value",
        data: values,
        backgroundColor: "rgba(39, 174, 96, .5)",
        borderColor: "rgba(39, 174, 96, 1)",
        borderWidth: 1,
      },
    ],
  };
  const config = {
    type: "bar",
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
  const chartCanvas = document.getElementById("compare-chart");
  new Chart(chartCanvas, config);
}

function getRandomColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

function generateChart(value, stockRows) {
  const data = {
    labels: value.dates,
    datasets: [
      {
        label: `${value.sector} (${value.instrumentNames.join(", ")})`,
        data: value.graph,
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

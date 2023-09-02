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
let backgroundColors;
function getRandomColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}
async function getData() {
  const connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: dbConnectionString,
  });

  [rows] = await connection.query(
    `SELECT h.id, h.date, h.qty, h.avg_cost, h.ltp, h.cur_val, h.p_l, h.net_chg, h.day_chg,
      i.name AS instrument, i.sector_id FROM holdings AS h INNER JOIN instrument AS i ON
      h.instrument_id = i.id ORDER BY id DESC LIMIT ${totalInstruments};`
  );
  let arr = Array(totalInstruments).fill(0);
  backgroundColors = arr.map(() => getRandomColor());
  doughnutChart(rows);
  compareChart(rows);
  plChart(rows);
  plValueChart(rows);

  [allRows] = await connection.query(
    `SELECT h.id, h.date, h.qty, h.avg_cost, h.ltp, h.cur_val, h.p_l, h.net_chg, h.day_chg, i.name AS instrument, i.sector_id
    FROM holdings AS h INNER JOIN instrument AS i ON h.instrument_id = i.id;`
  );
  allHoldingsChart(allRows);
}

function doughnutChart() {
  const labels = rows.map((item) => item.instrument);
  const values = rows.map((item) => item.cur_val);
  const data = {
    labels: labels,
    datasets: [
      {
        data: values,
        backgroundColor: backgroundColors,
        borderColor: backgroundColors,
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
function compareChart(rows) {
  const labels = rows.map((item) => item.instrument);
  const values = rows.map((item) => item.cur_val);
  const values1 = rows.map((item) => item.avg_cost * item.qty);
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

function plChart(rows) {
  const labels = rows.map((item) => item.instrument);
  const values = rows.map(
    (item) => (100 * item.p_l) / (item.avg_cost * item.qty)
  );
  const colors = values.map((row) =>
    row < 0 ? "rgba(255, 110, 100, .5)" : "rgba(0, 125, 10, .5)"
  );
  const data = {
    labels: labels,
    datasets: [
      {
        label: "Current profit / loss %",
        data: values,
        backgroundColor: colors,
        borderColor: colors,
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
  const chartCanvas = document.getElementById("pl-chart");
  new Chart(chartCanvas, config);
}

function plValueChart(rows) {
  const labels = rows.map((item) => item.instrument);
  const values = rows.map((item) => item.cur_val - item.avg_cost * item.qty);
  const colors = values.map((row) =>
    row < 0 ? "rgba(255, 110, 100, .5)" : "rgba(0, 125, 10, .5)"
  );
  const data = {
    labels: labels,
    datasets: [
      {
        label: "Current profit / loss",
        data: values,
        backgroundColor: colors,
        borderColor: colors,
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
  const chartCanvas = document.getElementById("pl-value-chart");
  new Chart(chartCanvas, config);
}

function allHoldingsChart(rows) {
  const groupedData = rows.reduce((acc, obj) => {
    const date = new Date(obj.date).getTime();
    const existingGroup = acc.find(
      (group) => new Date(group.date).getTime() === date
    );
    if (existingGroup) {
      existingGroup.data.push(obj);
    } else {
      acc.push({ date: date, data: [obj] });
    }
    return acc;
  }, []);

  const labels = groupedData.map((data) => new Date(data.date).toDateString());

  function getPercent(found) {
    if (found) return (100 * found.p_l) / (found.avg_cost * found.qty);
    else return 0;
  }
  function generateDataSets(type, label) {
    let color = getRandomColor();
    let arr = [];
    for (let i = 0; i < groupedData.length; i++) {
      let found = groupedData[i].data.find((x) => x.instrument === label);
      let cal = type === "daily" ? found?.day_chg : getPercent(found);
      arr.push(cal);
    }

    return {
      label: label,
      data: arr,
      backgroundColor: color,
      borderColor: color,
      borderWidth: 1.5,
    };
  }

  const chartCanvas = document.getElementById("daily-chart");
  new Chart(chartCanvas, getConfig("daily"));
  const chartCanvas1 = document.getElementById("total-chart");
  new Chart(chartCanvas1, getConfig("total"));

  function getConfig(type) {
    let dataset = [];
    for (let i = 0; i < totalInstruments; i++) {
      let label = groupedData[groupedData.length - 1]?.data[i]?.instrument;
      dataset.push(generateDataSets(type, label));
    }
    const data = {
      labels: labels,
      datasets: dataset,
    };
    return {
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
  }
}
getData();

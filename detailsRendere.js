const mysql = require("mysql2/promise");
const backgroundColors = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0].map(() =>
  getRandomColor()
);
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
    database: "test",
  });

  [rows] = await connection.query(
    "SELECT * FROM holdings ORDER BY id DESC LIMIT 15;"
  );

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

  compareChart(rows);
  plChart(rows);
  plValueChart(rows);
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
getData();

const mysql = require("mysql");
const { ipcRenderer } = require("electron");

// Replace the connection details with your own
const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "stock_portfolio",
});

const form = document.getElementById("form");
form.addEventListener("submit", (event) => {
  event.preventDefault(); // Prevent the default form submission behavior

  // Get form data
  const date = document.getElementById("datepicker").value;
  const dailyPL = document.getElementById("daily-pl").value;
  const totalPL = document.getElementById("total-pl-input").value;
  const currentValue = document.getElementById("current-value").value;
  const nifty = document.getElementById("nifty-50").value;

  // Save form data to MySQL database
  const query = `INSERT INTO daily_pl (date, daily_pl, total_pl, current_value, nifty_50) VALUES ('${date}', ${dailyPL}, ${totalPL}, ${currentValue}, ${nifty})`;
  connection.query(query, (err, result) => {
    if (err) {
      console.log(err);
      throw err;
    }
    ipcRenderer.send("reload-app");
  });

  // Reset form
  document.getElementById("form").reset();
});

const weeklyBtnEvent = document.getElementById("weekly");
weeklyBtnEvent.addEventListener("click", (event) => {
  Chart.helpers.each(Chart.instances, (chart) => {
    chart.destroy();
  });
  ipcRenderer.send("weekly-data");
});

const monthlyBtnEvent = document.getElementById("monthly");
monthlyBtnEvent.addEventListener("click", (event) => {
  Chart.helpers.each(Chart.instances, (chart) => {
    chart.destroy();
  });
  ipcRenderer.send("monthly-data");
});

const allBtnEvent = document.getElementById("all");
allBtnEvent.addEventListener("click", () => {
  ipcRenderer.send("reload-app");
});

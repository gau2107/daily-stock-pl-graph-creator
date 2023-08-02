const mysql = require("mysql");
const { ipcRenderer } = require("electron");
const Papa = require("papaparse");
const dotenv = require("dotenv");
const path = require("path");

const envFilePath =
  process.env.NODE_ENV === "production" ? ".env.production" : ".env.local";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });
const dbConnectionString = process.env.DB_CONNECTION_STRING;
// Replace the connection details with your own
const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: dbConnectionString,
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

const filterBtn = document.getElementById("filter");
filterBtn.addEventListener("click", () => {
  Chart.helpers.each(Chart.instances, (chart) => {
    chart.destroy();
  });
  const startDate = document.getElementById("start-date").value;
  const endDate = document.getElementById("end-date").value;
  ipcRenderer.send("filterData", { startDate, endDate });
});

const fileUploadInput = document.getElementById("holdings");
fileUploadInput.addEventListener("change", (event) => {
  let file = event.target.files[0];

  // Parse local CSV file
  Papa.parse(file, {
    download: true,
    complete: function (results) {
      results.data.shift();
      let data = results.data.filter((arr) => arr.length === 8);

      const tableName = "holdings";

      const columns = [
        "instrument",
        "qty",
        "avg_cost",
        "ltp",
        "cur_val",
        "p_l",
        "net_chg",
        "day_chg",
      ];

      // Build the query for bulk insert
      const insertQuery = `INSERT INTO ${tableName} (${columns.join(
        ", "
      )}) VALUES ?`;

      connection.query(insertQuery, [data], (err, results) => {
        if (err) throw err;
      });
    },
  });
});

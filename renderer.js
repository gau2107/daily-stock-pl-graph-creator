const mysql = require("mysql2/promise");

const { ipcRenderer } = require("electron");
const Papa = require("papaparse");
const dotenv = require("dotenv");
const path = require("path");

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });
const dbConnectionString = process.env.DB_CONNECTION_STRING;
// Replace the connection details with your own

const form = document.getElementById("form");
form.addEventListener("submit", async (event) => {
  event.preventDefault(); // Prevent the default form submission behavior

  // Get form data
  const date = document.getElementById("datepicker").value;
  const dailyPL = document.getElementById("daily-pl").value;
  const totalPL = document.getElementById("total-pl-input").value;
  const currentValue = document.getElementById("current-value").value;
  const nifty = document.getElementById("nifty-50").value;
  const connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: dbConnectionString,
  });

  // Save form data to MySQL database
  const query = `INSERT INTO daily_pl (date, daily_pl, total_pl, current_value, nifty_50) VALUES ('${date}', ${dailyPL}, ${totalPL}, ${currentValue}, ${nifty})`;
  await connection.query(query);
  ipcRenderer.send("reload-app");

  // Reset form
  document.getElementById("form").reset();
});

function handleActiveClass(element) {
  weeklyBtn.classList.replace("btn-dark", "btn-secondary");
  monthlyBtn.classList.replace("btn-dark", "btn-secondary");
  quarterlyBtn.classList.replace("btn-dark", "btn-secondary");
  yearlyBtn.classList.replace("btn-dark", "btn-secondary");
  allBtn.classList.replace("btn-dark", "btn-secondary");
  filterBtn.classList.replace("btn-dark", "btn-secondary");
  element.classList.replace("btn-secondary", "btn-dark");
}

const weeklyBtn = document.getElementById("weekly");
weeklyBtn.addEventListener("click", (event) => {
  handleActiveClass(weeklyBtn);
  Chart.helpers.each(Chart.instances, (chart) => {
    chart.destroy();
  });
  ipcRenderer.send("weekly-data");
});

const monthlyBtn = document.getElementById("monthly");
monthlyBtn.addEventListener("click", (event) => {
  handleActiveClass(monthlyBtn);
  Chart.helpers.each(Chart.instances, (chart) => {
    chart.destroy();
  });
  ipcRenderer.send("monthly-data");
});

const quarterlyBtn = document.getElementById("quarterly");
quarterlyBtn.addEventListener("click", (event) => {
  handleActiveClass(quarterlyBtn);
  Chart.helpers.each(Chart.instances, (chart) => {
    chart.destroy();
  });
  ipcRenderer.send("quarterly-data");
});

const yearlyBtn = document.getElementById("yearly");
yearlyBtn.addEventListener("click", (event) => {
  handleActiveClass(yearlyBtn);
  Chart.helpers.each(Chart.instances, (chart) => {
    chart.destroy();
  });
  ipcRenderer.send("yearly-data");
});


const allBtn = document.getElementById("all");
allBtn.addEventListener("click", () => {
  handleActiveClass(allBtn);
  Chart.helpers.each(Chart.instances, (chart) => {
    chart.destroy();
  });
  ipcRenderer.send("all-data");
});

const filterBtn = document.getElementById("filter");
filterBtn.addEventListener("click", () => {
  const startDate = document.getElementById("start-date").value;
  const endDate = document.getElementById("end-date").value;
  if (!startDate || !endDate) return;
  handleActiveClass(filterBtn);
  Chart.helpers.each(Chart.instances, (chart) => {
    chart.destroy();
  });
  ipcRenderer.send("filterData", { startDate, endDate });
});

const fileUploadInput = document.getElementById("holdings");
fileUploadInput.addEventListener("change", async (event) => {
  const c = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: dbConnectionString,
  });
  let table;
  const query = `SELECT * from instrument`;
  [table] = await c.query(query);
  let file = event.target.files[0];
  // Parse local CSV file
  Papa.parse(file, {
    download: true,
    complete: function (results) {
      results.data.shift(); //remove first row as it contains labels
      let data = results.data.filter((arr) => arr.length === 8); //so we can filter out blank array
      // replace instrument name to store properly in database
      for (let i = 0; i < data.length; i++) {
        if (data[i][0].startsWith("MCDOW")) data[i][0] = "UNITDSPR";
        if (data[i][0].startsWith("SGBJUN")) data[i][0] = "SGBJUNE31";
        if (data[i][0].startsWith("HCL")) data[i][0] = "HCL-INSYS";
        let d = table.find((d) => d.name === data[i][0]);
        data[i][0] = d.id;
      }

      const tableName = "holdings";

      const columns = [
        "instrument_id",
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

      c.query(insertQuery, [data], (err, results) => {
        if (err) throw err;
      });
    },
  });
});

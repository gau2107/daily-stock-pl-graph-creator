const mysql = require("mysql");
const electron = require('electron');

const { ipcRenderer } = electron;

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
  const dailyPL = document.getElementById("dailyPL").value;
  const totalPL = document.getElementById("totalPL").value;
  const currentValue = document.getElementById("currentValue").value;

  // Save form data to MySQL database
  const query = `INSERT INTO daily_pl (date, daily_pl, total_pl, current_value) VALUES ('${date}', ${dailyPL}, ${totalPL}, ${currentValue})`;
  connection.query(query, (err, result) => {
    if (err) {
      console.log(err);
      throw err;
    }
    console.log(result);
  });

  // Reset form
  document.getElementById("form").reset();
});

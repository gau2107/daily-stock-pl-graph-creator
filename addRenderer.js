const mysql = require("mysql");
const { ipcRenderer } = require("electron");
const dotenv = require("dotenv");
const path = require("path");

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });
const dbConnectionString = process.env.DB_CONNECTION_STRING;

// Replace the connection details with your own
const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: dbConnectionString,
});

const baseForm = document.getElementById("base-form");
baseForm.addEventListener("submit", (event) => {
  event.preventDefault(); // Prevent the default form submission behavior

  // Get form data
  const investmentValue = document.getElementById("investment-value").value;

  // Save form data to MySQL database
  const query =
    "UPDATE daily_pl SET current_value = current_value + " + investmentValue;
  connection.query(query, (err, result) => {
    if (err) {
      console.log(err);
      throw err;
    }
    ipcRenderer.send("reload-app");
  });

  // Reset form
  document.getElementById("base-form").reset();
});

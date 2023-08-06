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

const instrumentForm = document.getElementById("instrument-form");
instrumentForm.addEventListener("submit", (event) => {
  event.preventDefault(); // Prevent the default form submission behavior

  // Get form data
  const instrumentValue = document.getElementById("instrument-value").value;
  const sectorValue = document.getElementById("sector-value").value;
  // Save form data to MySQL database
  const query = `INSERT INTO instrument (name, sector_id) VALUES ('${instrumentValue}', '${sectorValue}')`;
  connection.query(query, (err, result) => {
    if (err) {
      console.log(err);
      throw err;
    }
  });

  // Reset form
  document.getElementById("instrument-form").reset();
});

// load dropdown with sector values
const selectBox = document.getElementById("sector-value");
const query = "SELECT id, name FROM sector";
connection.query(query, (err, rows) => {
  if (err) throw err;

  // Populate the select box options
  rows.forEach((row) => {
    const option = document.createElement("option");
    option.value = row.id;
    option.text = row.name;
    selectBox.appendChild(option);
  });
});

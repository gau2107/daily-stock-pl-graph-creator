const mysql = require("mysql2/promise");
const { ipcRenderer } = require("electron");
const dotenv = require("dotenv");
const path = require("path");

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });
const dbConnectionString = process.env.DB_CONNECTION_STRING;

// Replace the connection details with your own
let connection;

async function getData() {
  let newConnection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: dbConnectionString,
  });
  let [rows] = await newConnection.query(`SELECT * from cumulative_holdings`);

  // load dropdown with sector values
  const investmentTypeSelectBox = document.getElementById("scheme-value");
  const investmentTypeQuery = "SELECT id, name FROM investment_scheme";


  let [newRows] = await newConnection.query(investmentTypeQuery);
  // Populate the select box options
  newRows.forEach((row) => {
    const option = document.createElement("option");
    option.value = row.id;
    option.text = row.name;
    investmentTypeSelectBox.appendChild(option.cloneNode(true));
  });

}

const form = document.getElementById("form");
form.addEventListener("submit", async (event) => {
  event.preventDefault(); // Prevent the default form submission behavior

  // Get form data
  const date = document.getElementById("datepicker").value;
  const schemeValue = document.getElementById("scheme-value").value;
  const investedValue = document.getElementById("cumulative-value-invested").value;
  const currentValue = document.getElementById("valuation").value;
  connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: dbConnectionString,
  });


  // Save form data to MySQL database
  const query = `INSERT INTO cumulative_holdings (date, scheme_id, invested_value, current_value) VALUES ('${date}', ${schemeValue}, ${investedValue}, ${currentValue})`;
  await connection.query(query);
  ipcRenderer.send("reload-app");

  // Reset form
  document.getElementById("form").reset();
});


getData();
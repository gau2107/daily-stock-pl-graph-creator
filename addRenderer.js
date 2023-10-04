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

const editForm = document.getElementById("edit-instrument-form");
editForm.addEventListener("submit", (event) => {
  event.preventDefault(); // Prevent the default form submission behavior

  // Get form data
  const investmentValue = document.getElementById("edit-instrument-value").value;
  const sectorValue = document.getElementById("edit-sector-value").value;
  const checkboxValue = document.getElementById("edit-checkbox").checked;

  // Save form data to MySQL database
  const query =
    `UPDATE instrument SET sector_id=${sectorValue}, is_active=${checkboxValue} WHERE id=${investmentValue}`
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

// load dropdown with sector values
const selectBox = document.getElementById("sector-value");
const editSelectBox = document.getElementById("edit-sector-value");
const editInstrumentBox = document.getElementById("edit-instrument-value");
const query = "SELECT id, name FROM sector";
connection.query(query, (err, rows) => {
  if (err) throw err;

  // Populate the select box options
  rows.forEach((row) => {
    const option = document.createElement("option");
    option.value = row.id;
    option.text = row.name;
    selectBox.appendChild(option.cloneNode(true));
    editSelectBox.appendChild(option);
  });

  let instrumentRows = [];
  const instrumentQuery = "SELECT id, name, is_active, sector_id FROM instrument";
  connection.query(instrumentQuery, (err, rows) => {
    if (err) throw err;
    instrumentRows = [...rows];
    // Populate the select box options
    rows.forEach((row) => {
      const option = document.createElement("option");
      option.value = row.id;
      option.text = row.name;
      editInstrumentBox.appendChild(option);
    });
  });


  editInstrumentBox.addEventListener('change', function () {
    let temp = instrumentRows.find(obj => obj.id == editInstrumentBox.value);
    const checkbox = document.getElementById('edit-checkbox'); // Replace 'myCheckbox' with your checkbox's ID
    checkbox.checked = temp.is_active;
    editSelectBox.value = temp.sector_id;
  });


});
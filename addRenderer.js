const mysql = require("mysql");
const { ipcRenderer } = require("electron");
const dotenv = require("dotenv");
const path = require("path");

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });

// Replace the connection details with your own
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
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

const sectorForm = document.getElementById("add-sector-form");
sectorForm.addEventListener("submit", (event) => {
  event.preventDefault(); // Prevent the default form submission behavior

  // Get form data
  const sectorValue = document.getElementById("add-sector").value;
  // Save form data to MySQL database
  const query = `INSERT INTO sector (name) VALUES ('${sectorValue}')`;
  connection.query(query, (err, result) => {
    if (err) {
      console.log(err);
      throw err;
    }
  });

  // Reset form
  document.getElementById("add-sector-form").reset();
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

// create new instrument type
const instrumentTypeForm = document.getElementById("add-instrument-type-form");
instrumentTypeForm.addEventListener("submit", (event) => {
  event.preventDefault(); // Prevent the default form submission behavior

  // Get form data
  const instrumentValue = document.getElementById("add-instrument-type").value;
  // Save form data to MySQL database
  const query = `INSERT INTO investment_types (name) VALUES ('${instrumentValue}')`;
  connection.query(query, (err, result) => {
    if (err) {
      console.log(err);
      throw err;
    }
  });

  // Reset form
  document.getElementById("add-instrument-type-form").reset();
});

// create new investment scheme
const investmentSchemeForm = document.getElementById("add-investment-scheme-form");
investmentSchemeForm.addEventListener("submit", (event) => {
  event.preventDefault(); // Prevent the default form submission behavior

  // Get form data
  const investmentValue = document.getElementById("investment-scheme-name").value;
  const investmentTypeValue = document.getElementById("investment-type-select-value").value;
  // Save form data to MySQL database
  const query = `INSERT INTO investment_scheme (name, investment_type_id) VALUES ('${investmentValue}', '${investmentTypeValue}')`;
  connection.query(query, (err, result) => {
    if (err) {
      console.log(err);
      throw err;
    }
  });

  // Reset form
  document.getElementById("add-investment-scheme-form").reset();
});

// load dropdown with sector values
const selectBox = document.getElementById("sector-value");
const investmentTypeSelectBox = document.getElementById("investment-type-select-value");
const editSelectBox = document.getElementById("edit-sector-value");
const editInstrumentBox = document.getElementById("edit-instrument-value");
const checkbox = document.getElementById('edit-checkbox');

const query = "SELECT id, name FROM sector";
const investmentTypeQuery = "SELECT id, name FROM investment_types";

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
    editSelectBox.value = instrumentRows[0].sector_id;
    checkbox.checked = instrumentRows[0].is_active;
  });


  editInstrumentBox.addEventListener('change', function () {
    let temp = instrumentRows.find(obj => obj.id == editInstrumentBox.value);
    checkbox.checked = temp.is_active;
    
    editSelectBox.value = temp.sector_id;
  });


});

connection.query(investmentTypeQuery, (err, rows) => {
  if (err) throw err;

  // Populate the select box options
  rows.forEach((row) => {
    const option = document.createElement("option");
    option.value = row.id;
    option.text = row.name;
    investmentTypeSelectBox.appendChild(option.cloneNode(true));
    editSelectBox.appendChild(option);
  });

});
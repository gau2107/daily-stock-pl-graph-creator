const mysql = require("mysql");
const { ipcRenderer } = require("electron");

// Replace the connection details with your own
const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "test",
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

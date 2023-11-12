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
  let [rows] = await newConnection.query(`SELECT c.id, t.name as investment_type, s.name as investment_scheme, c.invested_value, c.current_value, c.date, c.p_l FROM cumulative_holdings as c INNER JOIN investment_scheme as s ON c.scheme_id = s.id INNER JOIN investment_types as t ON s.investment_type_id = t.id ORDER BY c.id`);

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

  generateChart(rows);
  generatePieChart(rows);
}

function generateChart(rows) {
  rows = groupedByMonth(rows);

  let labels = rows.map(r => r.month);
  let values = rows.map(r => (r.totalProfitValue * 100) / r.totalInvestedValue);
  const data = {
    labels: labels,
    datasets: [
      {
        label: 'Cumulative Profit %',
        data: values,
        borderColor: "rgba(39, 174, 96, 1)",
        backgroundColor: "rgba(39, 174, 96, .5)",
        borderWidth: 1,
      },
    ],
  };
  const config = {
    type: "bar",
    data: data,
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "top",
        },
      },
    },
  };
  const chartCanvas = document.getElementById("chart");
  new Chart(chartCanvas, config);
}
function getRandomColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}
function generatePieChart(rows) {
  // TODO make 5 dynamic
  const elements = rows.slice(0, 5);

  let labels = elements.map(r => r.investment_scheme);
  let values = elements.map(r => r.current_value);
  const data = {
    labels: labels,
    datasets: [
      {
        label: 'Current Value',
        data: values,
        hoverOffset: 5,
      }
    ],
  };
  const config = {
    type: "pie",
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
        },
      },
    },
  };
  let labels1 = elements.map(r => r.investment_scheme);
  let values1 = elements.map(r => r.invested_value);
  const data1 = {
    labels: labels1,
    datasets: [
      {
        label: 'Current Value',
        data: values1,
        hoverOffset: 5,
      }
    ],
  };
  const config1 = {
    type: "pie",
    data: data1,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "bottom",
        },
      },
    },
  };
  const chartCanvas = document.getElementById("pie-chart");
  new Chart(chartCanvas, config);
  const chartCanvas1 = document.getElementById("pie-chart1");
  new Chart(chartCanvas1, config1);
}

const groupedByMonth = (data) => {
  let groupedByMonth = data.reduce((result, item) => {
    const month = item.date.split('-')[1]; // Extracting month from date
    if (!result[month]) {
      result[month] = [];
    }
    result[month].push(item);
    return result;
  }, {});
  return Object.entries(groupedByMonth).map(([month, data]) => {
    const totalInvestedValue = data.reduce((sum, item) => sum + item.invested_value, 0);
    const totalCurrentValue = data.reduce((sum, item) => sum + item.current_value, 0);
    const totalProfitValue = data.reduce((sum, item) => sum + item.p_l, 0);
    return { month, data, totalInvestedValue, totalCurrentValue, totalProfitValue };
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
  // ipcRenderer.send("reload-app");

  // Reset form
  document.getElementById("form").reset();
});


getData();
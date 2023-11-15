const mysql = require("mysql2/promise");
const { ipcRenderer } = require("electron");
const dotenv = require("dotenv");
const path = require("path");

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });
const dbConnectionString = process.env.DB_CONNECTION_STRING;

let months = new Map();
months.set('01', 'January');
months.set('02', 'February');
months.set('03', 'March');
months.set('04', 'April');
months.set('05', 'May');
months.set('06', 'June');
months.set('07', 'July');
months.set('08', 'August');
months.set('09', 'September');
months.set('10', 'October');
months.set('11', 'November');
months.set('12', 'December');


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
  let schemeArray = groupedByScheme(rows);
  for (let i = 0; i < 5; i++) {
    getIndividualChart(schemeArray[i]);
  }
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

function getIndividualChart(obj) {
  let labels = obj.data.map(r => r.date);
  let values = obj.data.map(r => (r.p_l * 100) / r.invested_value);
  const data = {
    labels: labels,
    datasets: [
      {
        label: `${obj.title}`,
        data: values,
        hoverOffset: 5,
      }
    ],
  };
  const config = {
    type: "bar",
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
        },
      },
    },
  };

  const div = document.createElement("div");
  div.className = "col-md-4";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  new Chart(ctx, config);
  const container = document.getElementById("row");
  container.appendChild(div);
  div.appendChild(canvas);
}

function generatePieChart(rows) {
  // TODO make 5 dynamic
  const elements = rows.slice(-5);

  let labels = elements.map(r => r.investment_scheme);
  let currentValues = elements.map(r => r.current_value);
  const currentChartData = {
    labels: labels,
    datasets: [
      {
        label: 'Current Value',
        data: currentValues,
        hoverOffset: 5,
      }
    ],
  };
  const curChartConfig = {
    type: "pie",
    data: currentChartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: 'Current Value'
        },
        legend: {
          position: "bottom",
        },
      },
    },
  };
  let investedValues = elements.map(r => r.invested_value);
  const investedChartData = {
    labels: labels,
    datasets: [
      {
        label: 'Current Value',
        data: investedValues,
        hoverOffset: 5,
      }
    ],
  };
  const invChartConfig = {
    type: "pie",
    data: investedChartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: 'Invested Value'
        },
        legend: {
          position: "bottom",
        },
      },
    },
  };
  const chartCanvas = document.getElementById("current-pie-chart");
  new Chart(chartCanvas, curChartConfig);
  const chartCanvas1 = document.getElementById("invested-pie-chart");
  new Chart(chartCanvas1, invChartConfig);
}

const groupedByMonth = (data) => {
  const groupedByMonthMap = data.reduce((result, item) => {
    const month = item.date.split('-')[1]; // Extracting month from date

    if (!result.has(month)) {
      result.set(month, []);
    }

    result.get(month).push(item);
    return result;
  }, new Map());

  return Array.from(groupedByMonthMap).map(([month, data]) => {
    const totalInvestedValue = data.reduce((sum, item) => sum + item.invested_value, 0);
    const totalCurrentValue = data.reduce((sum, item) => sum + item.current_value, 0);
    const totalProfitValue = data.reduce((sum, item) => sum + item.p_l, 0);

    month = months.get(month); // Assuming you have a Map named 'months' for month name lookup

    return { month, data, totalInvestedValue, totalCurrentValue, totalProfitValue };
  });
};

const groupedByScheme = (data) => {
  let groupedByScheme = data.reduce((result, item) => {
    if (!result[item.investment_scheme]) {
      result[item.investment_scheme] = [];
    }
    result[item.investment_scheme].push(item);
    return result;
  }, {});
  return Object.entries(groupedByScheme).map(([title, data]) => {
    return { title, data };
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
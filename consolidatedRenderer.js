const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");
const dayjs = require("dayjs");
const { getRandomColor, colors } = require("./src/utils/utils");

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });


// Replace the connection details with your own
let connection;
let connectionPromise;

(async function initConnection() {
  try {
    connectionPromise = mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    connection = await connectionPromise;
    console.log("Database connected successfully");
  } catch (error) {
    console.error("Database connection failed:", error);
    connection = null;
    // Don't show alert immediately, let the user try operations first
  }
})();

try {
  // Add connection check before initial getData call
  if (connectionPromise) {
    connectionPromise.then(() => {
      getData();
    }).catch((error) => {
      console.error("Error initializing data:", error);
      alert("Failed to load initial data. Please refresh the page.");
    });
  } else {
    getData();
  }
} catch (error) {
  console.error("Error initializing data:", error);
  alert("Failed to load initial data. Please refresh the page.");
}

async function getData() {
  let rows, newRows;
  
  try {
    // Wait for connection to be established if it's still pending
    if (!connection && connectionPromise) {
      try {
        connection = await connectionPromise;
      } catch (error) {
        console.error("Failed to establish database connection:", error);
        alert("Database connection failed. Please refresh the page.");
        return;
      }
    }
    
    if (!connection) {
      console.error("No database connection available");
      alert("Database connection not available. Please refresh the page.");
      return;
    }

    [rows] = await connection.query(`SELECT c.id, t.name as investment_type, s.name as investment_scheme, c.invested_value, c.current_value, c.date, c.p_l 
      FROM cumulative_holdings as c INNER JOIN investment_scheme as s ON c.scheme_id = s.id INNER JOIN investment_types as t ON s.investment_type_id = t.id
      where s.is_active = true ORDER BY c.date`);
  } catch (error) {
    console.error("Database query error for holdings:", error);
    alert("Failed to fetch holdings data. Please check your connection.");
    return;
  }

  const investmentTypeSelectBox = document.getElementById("scheme-value");
  const investmentTypeQuery = "SELECT id, name FROM investment_scheme WHERE is_active = true";

  try {
    [newRows] = await connection.query(investmentTypeQuery);
    newRows.forEach((row) => {
      const option = document.createElement("option");
      option.value = row.id;
      option.text = row.name;
      investmentTypeSelectBox.appendChild(option.cloneNode(true));
    });
  } catch (error) {
    console.error("Database query error for investment schemes:", error);
    alert("Failed to load investment schemes. Please refresh the page.");
    return;
  }

  generateChart(rows);
  generatePieChart(rows, newRows.length);
  let maxLen = 0;
  let schemeArray = groupedByScheme(rows);
  for (let i = 0; i < newRows.length; i++) {
    maxLen = schemeArray[i].data.length > maxLen ? schemeArray[i].data.length : maxLen;
    getIndividualChart(schemeArray[i]);
  }
}

function generateChart(rows) {
  rows = groupedByMonth(rows);
  let labels = rows.map(r => dayjs(r.month).format(`MMM YYYY`));
  let values = rows.map(r => ((r.totalProfitValue * 100) / r.totalInvestedValue).toFixed(2));
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
  let labels = obj.data.map(r => dayjs(r.date).format(`MMM YYYY`));
  let values = obj.data.map(r => ((r.p_l * 100) / r.invested_value).toFixed(2));
  const data = {
    labels: labels,
    datasets: [
      {
        label: ``,
        data: values,
        borderWidth: 1,
        hoverOffset: 1,
        type: "line",
        backgroundColor: "rgba(173, 216, 300, 1)"
      },
      {
        label: `${obj.title} %`,
        data: values,
        hoverOffset: 5,
        type: "bar",
        backgroundColor: "rgba(173, 216, 300, 0.7)",
        borderColor: "rgba(173, 216, 300, 1)",
        borderWidth: 1
      }
    ],
  };
  const config = {
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
  div.className = "col-md-6";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  new Chart(ctx, config);
  const container = document.getElementById("row");
  container.appendChild(div);
  div.appendChild(canvas);
}

function generatePieChart(rows, totalInvestmentSchemes) {
  const elements = rows.slice(-totalInvestmentSchemes);

  let labels = elements.map(r => r.investment_scheme);
  let currentValues = elements.map(r => r.current_value);

  let bgColors = [];
  let colors = [];
  for(let i = 0; i < currentValues.length; i++) {
    colors.push(getRandomColor());
    bgColors.push("black");
  }
  let totalCurrentValue = currentValues.reduce((sum, item) => sum + item, 0);
  const currentChartData = {
    labels: labels,
    datasets: [
      {
        label: 'Current Value',
        data: currentValues,
        borderColor: bgColors,
        backgroundColor: colors,
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
          text: `Current Value ₹${totalCurrentValue.toLocaleString("en-IN")}`
        },
        legend: {
          position: "bottom",
        },
      },
    },
  };
  let investedValues = elements.map(r => r.invested_value);
  let totalInvestedValue = investedValues.reduce((a, b) => a + b, 0);
  const investedChartData = {
    labels: labels,
    datasets: [
      {
        label: `Current Value`,
        borderColor: bgColors,
        backgroundColor: colors,
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
          text: `Invested Value ₹${totalInvestedValue.toLocaleString("en-IN")}`
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
    const month = item.date; // Extracting month from date

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

    month = month;

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
  const pL = currentValue - investedValue;
  
  try {
    // Wait for connection to be established if it's still pending
    if (!connection && connectionPromise) {
      try {
        connection = await connectionPromise;
      } catch (error) {
        console.error("Failed to establish database connection:", error);
        alert("Database connection failed. Please try again.");
        return;
      }
    }
    
    if (!connection) {
      throw new Error("No database connection available");
    }

    const query = `INSERT INTO cumulative_holdings (date, scheme_id, invested_value, current_value, p_l) VALUES ('${date}', ${schemeValue}, ${investedValue}, ${currentValue}, ${pL})`;
    await connection.query(query);
    
    alert("Data saved successfully!");
    document.getElementById("form").reset();
  } catch (error) {
    console.error("Database operation failed:", error);
    alert("Failed to save data. Please try again.");
  }
});

// Remove the immediate getData() call from here
const { createTursoClient } = require("./src/db/turso");
const dotenv = require("dotenv");
const path = require("path");
const dayjs = require("dayjs");

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatPercent = (value, total) =>
  total > 0 ? `${((value * 100) / total).toFixed(1)}%` : "0.0%";

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });


// Replace the connection details with your own
let connection;
let connectionPromise;

(async function initConnection() {
  try {
    connectionPromise = Promise.resolve(createTursoClient());
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
  generatePieChart(rows);
  groupedByScheme(rows).forEach(getIndividualChart);
}

function generateChart(rows) {
  const monthlyRows = groupedByMonth(rows);
  const labels = monthlyRows.map((row) => dayjs(row.month).format("MMM YYYY"));
  const values = monthlyRows.map((row) =>
    row.totalInvestedValue
      ? (row.totalProfitValue * 100) / row.totalInvestedValue
      : 0
  );
  const data = {
    labels,
    datasets: [
      {
        label: "Portfolio return",
        data: values,
        borderColor: "rgba(39, 174, 96, 1)",
        backgroundColor: "rgba(39, 174, 96, .16)",
        pointBackgroundColor: values.map((value) =>
          value < 0 ? "rgba(220, 53, 69, 1)" : "rgba(39, 174, 96, 1)"
        ),
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.3,
      },
    ],
  };
  const config = {
    type: "line",
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `Return: ${Number(context.raw).toFixed(2)}%`,
          },
        },
      },
      scales: {
        y: {
          title: { display: true, text: "Return" },
          ticks: { callback: (value) => `${value}%` },
          grid: { color: "rgba(0, 0, 0, .06)" },
        },
        x: { grid: { display: false } },
      },
    },
  };
  const chartCanvas = document.getElementById("chart");
  new Chart(chartCanvas, config);
}

function getIndividualChart(obj) {
  const labels = obj.data.map((row) => dayjs(row.date).format("MMM YYYY"));
  const values = obj.data.map((row) => {
    const investedValue = toNumber(row.invested_value);
    return investedValue ? (toNumber(row.p_l) * 100) / investedValue : 0;
  });
  const data = {
    labels,
    datasets: [
      {
        label: `${obj.title} return`,
        data: values,
        borderColor: "rgba(52, 120, 246, 1)",
        backgroundColor: "rgba(52, 120, 246, .14)",
        pointBackgroundColor: values.map((value) =>
          value < 0 ? "rgba(220, 53, 69, 1)" : "rgba(52, 120, 246, 1)"
        ),
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.3,
      }
    ],
  };
  const config = {
    type: "line",
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `Return: ${Number(context.raw).toFixed(2)}%`,
          },
        },
      },
      scales: {
        y: {
          title: { display: true, text: "Return" },
          ticks: { callback: (value) => `${value}%` },
          grid: { color: "rgba(0, 0, 0, .06)" },
        },
        x: { grid: { display: false } },
      },
    },
  };

  const div = document.createElement("div");
  div.className = "col-12 col-xl-6 mb-4";
  const canvas = document.createElement("canvas");
  const card = document.createElement("div");
  card.className = "consolidated-chart-card";
  const title = document.createElement("h3");
  title.className = "h6 mb-3";
  title.textContent = obj.title;
  const chartBody = document.createElement("div");
  chartBody.className = "individual-chart-body";
  chartBody.appendChild(canvas);
  card.append(title, chartBody);
  const container = document.getElementById("row");
  container.appendChild(div);
  div.appendChild(card);
  new Chart(canvas, config);
}

function generatePieChart(rows) {
  const latestByScheme = new Map();
  rows.forEach((row) => latestByScheme.set(row.investment_scheme, row));
  const elements = Array.from(latestByScheme.values());
  const labels = elements.map((row) => row.investment_scheme);
  const currentValues = elements.map((row) => toNumber(row.current_value));
  const investedValues = elements.map((row) => toNumber(row.invested_value));
  const backgroundColors = elements.map((_, index) => `hsl(${(index * 67) % 360} 62% 58%)`);
  const borderColors = elements.map((_, index) => `hsl(${(index * 67) % 360} 62% 38%)`);
  const totalCurrentValue = currentValues.reduce((sum, value) => sum + value, 0);
  const totalInvestedValue = investedValues.reduce((sum, value) => sum + value, 0);
  const totalCurrentProfit = elements.reduce((sum, item) => sum + toNumber(item.p_l), 0);
  const totalCurrentReturn = totalInvestedValue
    ? ((totalCurrentProfit * 100) / totalInvestedValue).toFixed(2)
    : "0.00";
  const formatMoney = (value) => `₹${toNumber(value).toLocaleString("en-IN")}`;
  const currentChartData = {
    labels,
    datasets: [
      {
        label: "Current value",
        data: currentValues,
        borderColor: borderColors,
        backgroundColor: backgroundColors,
        borderWidth: 2,
        hoverOffset: 8,
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
          text: `Current value ₹${totalCurrentValue.toLocaleString("en-IN")} · return ${totalCurrentReturn}%`,
        },
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            padding: 12,
          },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const item = elements[context.dataIndex];
              const value = toNumber(context.raw);
              const share = formatPercent(value, totalCurrentValue);
              const investedValue = toNumber(item.invested_value);
              const returnPercent = investedValue
                ? ((toNumber(item.p_l) * 100) / investedValue).toFixed(2)
                : "0.00";
              return `${context.label}: ${formatMoney(value)} (${share} of portfolio, ${returnPercent}% return)`;
            },
          },
        },
      },
    },
  };
  const investedChartData = {
    labels,
    datasets: [
      {
        label: "Invested value",
        borderColor: borderColors,
        backgroundColor: backgroundColors,
        data: investedValues,
        borderWidth: 2,
        hoverOffset: 8,
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
          text: `Invested value ₹${totalInvestedValue.toLocaleString("en-IN")} · return ${totalCurrentReturn}%`,
        },
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            padding: 12,
          },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = toNumber(context.raw);
              const item = elements[context.dataIndex];
              const investedValue = toNumber(item.invested_value);
              const returnPercent = investedValue
                ? ((toNumber(item.p_l) * 100) / investedValue).toFixed(2)
                : "0.00";
              return `${context.label}: ${formatMoney(value)} (${formatPercent(value, totalInvestedValue)} of invested total, ${returnPercent}% return)`;
            },
          },
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
    const month = item.date;

    if (!result.has(month)) {
      result.set(month, []);
    }

    result.get(month).push(item);
    return result;
  }, new Map());

  return Array.from(groupedByMonthMap).map(([month, data]) => {
    const totalInvestedValue = data.reduce((sum, item) => sum + toNumber(item.invested_value), 0);
    const totalCurrentValue = data.reduce((sum, item) => sum + toNumber(item.current_value), 0);
    const totalProfitValue = data.reduce((sum, item) => sum + toNumber(item.p_l), 0);

    return { month, data, totalInvestedValue, totalCurrentValue, totalProfitValue };
  });
};

const groupedByScheme = (data) => {
  const schemes = data.reduce((result, item) => {
    if (!result[item.investment_scheme]) {
      result[item.investment_scheme] = [];
    }
    result[item.investment_scheme].push(item);
    return result;
  }, {});
  return Object.entries(schemes).map(([title, data]) => {
    return { title, data };
  });
};

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
const { app, BrowserWindow } = require("electron");
const mysql = require("mysql2/promise");
async function createWindow() {
  const connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "stock_portfolio",
  });

  const [rows, fields] = await connection.query("SELECT * FROM daily_pl");

  const chartDataDailyPl = {
    labels: rows.map((row) => new Date(row.date).toDateString()),
    datasets: [
      {
        label: "Daily PL",
        data: rows.map((row) => row.daily_pl),
        borderColor: "rgba(255, 99, 132, 1)",
        backgroundColor: "rgba(255, 99, 132, 0.2)",
        borderWidth: 1,
      },
    ],
    options: {
      scales: {
        xAxes: [
          {
            gridLines: {
              zeroLineColor: "rgba(199, 22, 19, 0.1)",
            },
          },
        ],
      },
    },
  };

  const chartDataCurrentValue = {
    labels: rows.map((row) => new Date(row.date).toDateString()),
    datasets: [
      {
        label: "Current Value",
        data: rows.map((row) => row.current_value),
        borderColor: "rgba(255, 99, 132, 1)",
        backgroundColor: "rgba(255, 99, 132, 0.2)",
        borderWidth: 1,
      },
    ],
  };

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile("index.html");

  win.webContents.on("did-finish-load", () => {
    win.webContents.executeJavaScript(`
      const ctx = document.getElementById('daily-chart').getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: ${JSON.stringify(chartDataDailyPl)}
      });
    `);

    win.webContents.executeJavaScript(`
      const ctx2 = document.getElementById('current-chart').getContext('2d');
      new Chart(ctx2, {
        type: 'line',
        data: ${JSON.stringify(chartDataCurrentValue)}
      });
    `);
  });
}

app.whenReady().then(createWindow);

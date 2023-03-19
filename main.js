const { app, BrowserWindow } = require("electron");
const mysql = require("mysql2/promise");
async function createWindow() {
  const connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "stock_portfolio",
  });

  const [rows, fields] = await connection.query(
    "SELECT date, daily_pl FROM daily_pl"
  );

  const chartData = {
    labels: rows.map((row) => row.date),
    datasets: [
      {
        label: "Daily PL",
        data: rows.map((row) => row.daily_pl),
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
      const ctx = document.getElementById('chart').getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: ${JSON.stringify(chartData)}
      });
    `);
  });
}

app.whenReady().then(createWindow);

const { app, BrowserWindow, Menu } = require("electron");
const mysql = require("mysql2/promise");
const path = require("path");

const menuItems = [
  {
    label: "Window",
    submenu: [
      {
        role: "minimize",
      },
      {
        role: "close",
      },
    ],
  },
  {
    label: "About",
    onclick: () => {},
  },
];

const menu = Menu.buildFromTemplate(menuItems);
Menu.setApplicationMenu(menu);
async function createWindow() {
  const connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "stock_portfolio",
  });

  const [rows] = await connection.query("SELECT * FROM daily_pl");

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
    icon: __dirname + "/ico.ico",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname + "/preload.js"),
    },
  });

  win.loadFile("index.html");

  win.webContents.on("did-finish-load", () => {
    // Update the highest profit, highest loss, and last PL
    const highestPl = Math.max(...rows.map((row) => row.daily_pl));
    win.webContents
      .executeJavaScript(`const highestPlTag = document.getElementById("highest-profit");
    highestPlTag.innerHTML = ${highestPl};
    highestPlTag.style.color = 'green';
    `);

    const lowestPl = Math.min(...rows.map((row) => row.daily_pl));
    win.webContents
      .executeJavaScript(`const lowestPlTag = document.getElementById("lowest-profit");
    lowestPlTag.innerHTML = ${lowestPl};
    lowestPlTag.style.color = 'red';
    `);

    const lastPl = rows[rows.length - 1].daily_pl;
    win.webContents
      .executeJavaScript(`const lastPlTag = document.getElementById("last-pl");
    lastPlTag.innerHTML = ${lastPl};
    lastPlTag.style.color = ${lastPl > 0 ? "'green'" : "'red'"};
    `);

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

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

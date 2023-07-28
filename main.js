const dayjs = require("dayjs");
const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const mysql = require("mysql2/promise");
const path = require("path");

async function createWindow() {
  const connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "stock_portfolio",
  });

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    icon: __dirname + "/ico.ico",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname + "/preload.js"),
    },
  });

  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });

  win.loadFile("index.html");
  win.webContents.openDevTools();

  ipcMain.on("reload-app", async () => {
    [rows] = await connection.query("SELECT * FROM daily_pl");
    win.reload();
    if (newWindow) {
      setTimeout(() => {
        newWindow.close();
      }, 1000);
    }
  });

  function getCurrentDataForChart(rows) {
    return {
      labels: rows.map((row) => new Date(row.date).toDateString()),
      datasets: [
        {
          label: "Current Value",
          data: rows.map((row) => row.current_value),
          borderColor: "rgba(100, 150, 200, 1)",
          backgroundColor: "rgba(100, 150, 200, 0.2)",
          borderWidth: 1,
        },
      ],
    };
  }

  function getDailyPlDataForChart(rows) {
    const dailyChartData = rows.map((row) => row.daily_pl);
    const colors = rows.map((row) =>
      row.daily_pl < 0 ? "rgba(255, 110, 100, .5)" : "rgba(0, 125, 10, .5)"
    );
    return {
      labels: rows.map((row) => new Date(row.date).toDateString()),
      datasets: [
        {
          label: "Daily PL",
          data: dailyChartData,
          borderColor: rows.map((row) =>
            row.daily_pl < 0 ? "rgba(255, 110, 100, 1)" : "rgba(0, 125, 10, 1)"
          ),
          backgroundColor: colors,
          borderWidth: 1,
        },
      ],
    };
  }

  function getNiftyDataForChart(rows) {
    return {
      labels: rows.map((row) => new Date(row.date).toDateString()),
      datasets: [
        {
          label: "Nifty",
          data: rows.map(
            (row) =>
              ((row.nifty_50 - rows[0].nifty_50) * 100) / rows[0].nifty_50
          ),
          borderColor: "rgba(255, 110, 100, 1)",
          backgroundColor: "rgba(255, 110, 100, .5)",
          borderWidth: 1,
        },
        {
          label: "Total P/L",
          data: rows.map(
            (row) =>
              ((row.current_value - rows[0].current_value) * 100) /
              rows[0].current_value
          ),
          borderColor: "rgba(0, 125, 10, 1)",
          backgroundColor: "rgba(0, 125, 10, .5)",
          borderWidth: 1,
        },
      ],
    };
  }

  win.webContents.on("did-finish-load", async () => {
    let [rows] = await connection.query("SELECT * FROM daily_pl");

    // display history data
    const tableData = [...rows].reverse();
    win.webContents.executeJavaScript(
      `displayData(${JSON.stringify(tableData)})`
    );

    // get the highest profit, lowest profit, and last PL
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
    const lastPlPercent = (
      (lastPl * 100) /
      rows[rows.length - 2].current_value
    ).toFixed(2);
    win.webContents
      .executeJavaScript(`const lastPlTag = document.getElementById("last-pl");
    lastPlTag.innerHTML = ${lastPl};
    lastPlTag.innerHTML = lastPlTag.innerHTML + " "+"("+${lastPlPercent}+"%)";        
    lastPlTag.style.color = ${lastPl > 0 ? "'green'" : "'red'"};
    `);

    const totalPl = rows[rows.length - 1].total_pl;
    const totalPlPercent = ((totalPl * 100) / rows[0].current_value).toFixed(2);
    win.webContents
      .executeJavaScript(`const totalPlTag = document.getElementById("total-pl");
    totalPlTag.innerHTML = ${totalPl};
    totalPlTag.innerHTML = totalPlTag.innerHTML + " "+"("+${totalPlPercent}+"%)";        
    totalPlTag.style.color = ${totalPl > 0 ? "'green'" : "'red'"};
    `);

    // get the highest value, lowest value & streak
    const highestValue = Math.max(...rows.map((row) => row.current_value));
    win.webContents
      .executeJavaScript(`const highestValueTag = document.getElementById("highest-value");
    highestValueTag.innerHTML = ${highestValue};
    highestValueTag.style.color = 'green';
    `);

    // find the streak
    let streakType;
    let currentStreak = 0;
    for (let i = rows.length - 1; i > 0; i--) {
      if (streakType === "green" && rows[i].daily_pl < 0) {
        break;
      }
      if (streakType === "red" && rows[i].daily_pl > 0) {
        break;
      }
      if (rows[i].daily_pl > 0) {
        currentStreak += 1;
        streakType = "green";
      } else {
        currentStreak += 1;
        streakType = "red";
      }
    }

    win.webContents
      .executeJavaScript(`const streakTag = document.getElementById("streak");
    streakTag.innerHTML = ${currentStreak};
    streakTag.innerHTML += ${streakType === "green" ? "' 📈'" : "' 📉'"};
    streakTag.style.color = "${streakType}";
    `);

    // compare last week to this week
    const lastValue = rows[rows.length - 1].current_value;
    const lastWeekPl = rows[rows.length - 6].current_value;
    const plDifference = lastValue - lastWeekPl;

    win.webContents
      .executeJavaScript(`const lastWeekChange = document.getElementById("last-week-change");
     lastWeekChange.innerHTML = ${plDifference.toFixed(2)};
     lastWeekChange.style.color = "${plDifference > 0 ? "green" : "red"}";
     `);

    // compare last month to this month
    const lastMonthPl =
      rows[rows.length - 21]?.current_value || rows[0].current_value;
    const monthPlDifference = lastValue - lastMonthPl;
    const lastMonthPlPercent = (
      (monthPlDifference * 100) /
      lastMonthPl
    ).toFixed(2);

    win.webContents
      .executeJavaScript(`const lastMonthChange = document.getElementById("last-month-change");
     lastMonthChange.innerHTML = ${monthPlDifference.toFixed(2)};
     lastMonthChange.innerHTML = lastMonthChange.innerHTML + " "+"("+${lastMonthPlPercent}+"%)";        
     lastMonthChange.style.color = "${monthPlDifference > 0 ? "green" : "red"}";
     `);

    const lastYearCurrentValue =
      rows[rows.length - 261]?.current_value || rows[0].current_value;
    const yearPlDifference = (lastValue - lastYearCurrentValue).toFixed(2);
    const yearPercent = (
      (yearPlDifference * 100) /
      lastYearCurrentValue
    ).toFixed(2);
    win.webContents
      .executeJavaScript(`const lastYearReturns = document.getElementById("1-year-returns");
      lastYearReturns.innerHTML = ${yearPlDifference};
      lastYearReturns.innerHTML = lastYearReturns.innerHTML + " "+"("+${yearPercent}+"%)";        
      lastYearReturns.style.color = "${yearPlDifference > 0 ? "green" : "red"}";
      `);

    win.webContents.executeJavaScript(`
       let ctx = document.getElementById('current-chart').getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: ${JSON.stringify(getCurrentDataForChart(rows))}
      });
    `);

    win.webContents.executeJavaScript(`
      let ctx2 = document.getElementById('daily-chart').getContext('2d');
      new Chart(ctx2, {
        type: 'bar',
        data: ${JSON.stringify(getDailyPlDataForChart(rows))}
      });
    `);

    win.webContents.executeJavaScript(`
     let ctx3 = document.getElementById('nifty-chart').getContext('2d');
    new Chart(ctx3, {
      type: 'line',
      data: ${JSON.stringify(getNiftyDataForChart(rows))},
    });
  `);
  });

  ipcMain.on("weekly-data", async () => {
    [rows] = await connection.query("SELECT * FROM daily_pl");
    rows = rows.slice(-5);

    populateCharts(rows);
  });

  ipcMain.on("monthly-data", async () => {
    [rows] = await connection.query("SELECT * FROM daily_pl");
    rows = rows.slice(-22);

    populateCharts(rows);
  });

  ipcMain.on("filterData", async (event, data) => {
    [rows] = await connection.query("SELECT * FROM daily_pl");
    rows = rows.filter((temp) => {
      return (
        dayjs(temp.date).isAfter(dayjs(data.startDate).subtract(1, "day")) &&
        dayjs(temp.date).isBefore(dayjs(data.endDate).add(1, "day"))
      );
    });
    populateCharts(rows);
  });

  function populateCharts(rows) {
    win.webContents.executeJavaScript(`
    ctx = document.getElementById('current-chart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: ${JSON.stringify(getCurrentDataForChart(rows))}
    });
  `);
    win.webContents.executeJavaScript(`
      ctx2 = document.getElementById('daily-chart').getContext('2d');
      new Chart(ctx2, {
        type: 'bar',
        data: ${JSON.stringify(getDailyPlDataForChart(rows))}
      });
    `);

    win.webContents.executeJavaScript(`
    ctx3 = document.getElementById('nifty-chart').getContext('2d');
    new Chart(ctx3, {
      type: 'line',
      data: ${JSON.stringify(getNiftyDataForChart(rows))},
    });
    `);
  }

  let newWindow;
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
      label: "Add investment",
      click: async () => {
        newWindow = new BrowserWindow({
          width: 600,
          height: 400,
          webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            preload: path.join(__dirname + "/preload.js"),
          },
          transparent: true,
          parent: win,
          modal: true,
          menu: null,
        });
        newWindow.loadFile("add.html");
        newWindow.setMenu(null);
      },
    },
    {
      label: "About",
      click: async () => {
        await shell.openExternal("https://gsolanki.vercel.app/");
      },
    },
  ];

  const menu = Menu.buildFromTemplate(menuItems);
  Menu.setApplicationMenu(menu);
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

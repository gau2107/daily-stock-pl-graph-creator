const dayjs = require("dayjs");
const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const mysql = require("mysql2/promise");
const path = require("path");
const dotenv = require("dotenv");
const { getMenuTemplate } = require("./menu");
const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });

let connection;
let instruments = [];
let newWindow;

async function createWindow() {
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    [instruments] = await connection.query("SELECT * from instrument where is_active = true");
  } catch (error) {
    console.error("Error connecting to the database:", error);
    return;
  }

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
    autoHideMenuBar: false,
  });

  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });

  win.loadFile("index.html");
  // win.webContents.openDevTools();
// Use the imported menu template
const menu = Menu.buildFromTemplate(
  getMenuTemplate(win, createNewWindow, createIndividualStockWindow)
);
Menu.setApplicationMenu(menu);
  ipcMain.on("reload-app", async () => {
    try {
      [rows] = await connection.query("SELECT * FROM daily_pl");
      win.reload();
      if (newWindow) {
        setTimeout(() => {
          newWindow.close();
        }, 1000);
      }
    } catch (error) {
      console.error("Error in reload-app:", error);
    }
  });

  function getCurrentDataForChart(rows) {
    let data = rows.map((row) => row.current_value);
    let bgColors = rows.map((row) => row.daily_pl < 0 ? "rgba(255, 110, 100, .5)" : "rgba(39, 174, 96, .5)");
    let colors = rows.map((row) => row.daily_pl < 0 ? "rgba(255, 110, 100, 1)" : "rgba(39, 174, 96, 1)");
    return {
      labels: rows.map((row) => new Date(row.date).toDateString()),
      datasets: [
        {
          label: "Current Value",
          data: data,
          backgroundColor: bgColors,
          borderColor: colors,
          pointStyle: false,
          tension: .2
        },
      ],
    };
  }

  function getDailyPlDataForChart(rows) {
    const dailyChartData = rows.map((row) => row.daily_pl);
    const totalProfit = dailyChartData.reduce((sum, val) => sum + val, 0);
    const totalProfitPercent = ((totalProfit / Math.abs(dailyChartData[0] || 1)) * 100).toFixed(2);
    
    function colors(opacity) {
      return rows.map((row) =>
        row.daily_pl < 0 ? `rgba(255, 110, 100, ${opacity})` : `rgba(0, 125, 10, ${opacity})`
      );
    }
    
    return {
      labels: rows.map((row) => new Date(row.date).toDateString()),
      datasets: [
        {
          label: `Daily PL (${totalProfitPercent}%)`,
          data: dailyChartData,
          borderColor: colors(1),
          backgroundColor: colors(.5),
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
          pointStyle: false,
          tension: .2
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
          pointStyle: false,
          tension: .2
        },
      ],
    };
  }  

  win.webContents.on("did-finish-load", async () => {
    try {
      win.totalInstruments = instruments.length;

      let [rows] = await connection.query(`SELECT * FROM daily_pl WHERE date > '${dayjs().subtract(1, 'month').format('YYYY-MM-DD')}'`);
      let [startRow] = await connection.query("SELECT * FROM daily_pl LIMIT 1");
      let [yearRow] = await connection.query(`SELECT * FROM daily_pl WHERE date > '${dayjs().subtract(1, 'year').format('YYYY-MM-DD')}' LIMIT 1`);
      let [maxProfit] = await connection.query(`SELECT MAX(daily_pl) as max, MAX(current_value) as maxCV FROM daily_pl`);
      win.webContents.executeJavaScript(`const highestPlTag = document.getElementById("highest-profit");
      highestPlTag.innerHTML = ${maxProfit[0].max};
      highestPlTag.style.color = 'green';
      `);

      let [minProfit] = await connection.query(`SELECT MIN(daily_pl) as min FROM daily_pl`);
      win.webContents.executeJavaScript(`const lowestPlTag = document.getElementById("lowest-profit");
      lowestPlTag.innerHTML = ${minProfit[0].min};
      lowestPlTag.style.color = 'red';
      `);

      // Add guard for empty rows
      if (!rows || rows.length < 2) {
        win.webContents.executeJavaScript(`const lastPlTag = document.getElementById("last-pl");
        lastPlTag.innerHTML = "N/A";
        lastPlTag.style.color = "gray";
        `);
        win.webContents.executeJavaScript(`const totalPlTag = document.getElementById("total-pl");
        totalPlTag.innerHTML = "N/A";
        totalPlTag.style.color = "gray";
        `);
        win.webContents.executeJavaScript(`const highestValueTag = document.getElementById("highest-value");
        highestValueTag.innerHTML = "N/A";
        highestValueTag.style.color = "gray";
        `);
        win.webContents.executeJavaScript(`const streakTag = document.getElementById("streak");
        streakTag.innerHTML = "N/A";
        streakTag.style.color = "gray";
        `);
        win.webContents.executeJavaScript(`const lastWeekChange = document.getElementById("last-week-change");
        lastWeekChange.innerHTML = "N/A";
        lastWeekChange.style.color = "gray";
        `);
        win.webContents.executeJavaScript(`const lastMonthChange = document.getElementById("last-month-change");
        lastMonthChange.innerHTML = "N/A";
        lastMonthChange.style.color = "gray";
        `);
        win.webContents.executeJavaScript(`const lastYearReturns = document.getElementById("1-year-returns");
        lastYearReturns.innerHTML = "N/A";
        lastYearReturns.style.color = "gray";
        `);
        return;
      }

      const lastPl = rows[rows.length - 1].daily_pl;
      const lastPlPercent = (
        (lastPl * 100) /
        rows[rows.length - 2].current_value
      ).toFixed(2);
      win.webContents.executeJavaScript(`const lastPlTag = document.getElementById("last-pl");
      lastPlTag.innerHTML = ${lastPl};
      lastPlTag.innerHTML = lastPlTag.innerHTML + " "+"("+${lastPlPercent}+"%)";        
      lastPlTag.style.color = ${lastPl > 0 ? "'green'" : "'red'"};
      `);

      const totalPl = rows[rows.length - 1].total_pl;
      const totalPlPercent = ((totalPl * 100) / startRow[0].current_value).toFixed(2);
      win.webContents.executeJavaScript(`const totalPlTag = document.getElementById("total-pl");
      totalPlTag.innerHTML = ${totalPl};
      totalPlTag.innerHTML = totalPlTag.innerHTML + " "+"("+${totalPlPercent}+"%)";        
      totalPlTag.style.color = ${totalPl > 0 ? "'green'" : "'red'"};
      `);

      const highestValue = maxProfit[0].maxCV;
      const percent = (
        ((highestValue - startRow[0].current_value) * 100) /
        startRow[0].current_value
      ).toFixed(2);
      win.webContents.executeJavaScript(`const highestValueTag = document.getElementById("highest-value");
      highestValueTag.innerHTML = ${highestValue};
      highestValueTag.innerHTML = highestValueTag.innerHTML + " "+"("+${percent}+"%)";        
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

      win.webContents.executeJavaScript(`const streakTag = document.getElementById("streak");
      streakTag.innerHTML = ${currentStreak};
      streakTag.innerHTML += ${streakType === "green" ? "' 📈'" : "' 📉'"};
      streakTag.style.color = "${streakType}";
      `);

      // compare last week to this week
      const lastValue = rows[rows.length - 1].current_value;
      const lastWeekPl = rows[rows.length - 5]?.current_value ?? lastValue;
      const plDifference = lastValue - lastWeekPl;

      win.webContents.executeJavaScript(`const lastWeekChange = document.getElementById("last-week-change");
      lastWeekChange.innerHTML = ${plDifference.toFixed(2)};
      lastWeekChange.innerHTML = lastWeekChange.innerHTML + " "+"("+${((plDifference * 100) / lastWeekPl).toFixed(2)}+"%)";
      lastWeekChange.style.color = "${plDifference > 0 ? "green" : "red"}";
      `);

      // compare last month to this month
      const lastMonthPl =
        rows[0]?.current_value || startRow[0].current_value;
      const monthPlDifference = lastValue - lastMonthPl;
      const lastMonthPlPercent = (
        (monthPlDifference * 100) /
        lastMonthPl
      ).toFixed(2);

      win.webContents.executeJavaScript(`const lastMonthChange = document.getElementById("last-month-change");
      lastMonthChange.innerHTML = ${monthPlDifference.toFixed(2)};
      lastMonthChange.innerHTML = lastMonthChange.innerHTML + " "+"("+${lastMonthPlPercent}+"%)";        
      lastMonthChange.style.color = "${monthPlDifference > 0 ? "green" : "red"}";
      `);

      const lastYearCurrentValue =
        yearRow[0]?.current_value || startRow[0].current_value;
      const yearPlDifference = (lastValue - lastYearCurrentValue).toFixed(2);
      const yearPercent = (
        (yearPlDifference * 100) /
        lastYearCurrentValue
      ).toFixed(2);
      win.webContents.executeJavaScript(`const lastYearReturns = document.getElementById("1-year-returns");
        lastYearReturns.innerHTML = ${yearPlDifference};
        lastYearReturns.innerHTML = lastYearReturns.innerHTML + " "+"("+${yearPercent}+"%)";        
        lastYearReturns.style.color = "${yearPlDifference > 0 ? "green" : "red"}";
        `);
    } catch (error) {
      console.error("Error in did-finish-load:", error);
    }
  });

  ipcMain.on("get-total-instruments", (event) => {
    try {
      const data = win.totalInstruments || null;
      event.sender.send("total-instruments", data);
    } catch (error) {
      console.error("Error in get-total-instruments:", error);
    }
  });

  ipcMain.on("weekly-data", async () => {
    try {
      [rows] = await connection.query(`SELECT * FROM daily_pl WHERE date > '${dayjs().subtract(1, 'week').format('YYYY-MM-DD')}'`);
      populateCharts(rows);
    } catch (error) {
      console.error("Error in weekly-data:", error);
    }
  });

  ipcMain.on("monthly-data", async () => {
    try {
      [rows] = await connection.query(`SELECT * FROM daily_pl WHERE date > '${dayjs().subtract(1, 'month').format('YYYY-MM-DD')}'`);
      populateCharts(rows);
    } catch (error) {
      console.error("Error in monthly-data:", error);
    }
  });

  ipcMain.on("quarterly-data", async () => {
    try {
      [rows] = await connection.query(`SELECT * FROM daily_pl WHERE date > '${dayjs().subtract(3, 'months').format('YYYY-MM-DD')}'`);
      populateCharts(rows);
    } catch (error) {
      console.error("Error in quarterly-data:", error);
    }
  });

  ipcMain.on("yearly-data", async () => {
    try {
      [rows] = await connection.query(`SELECT * FROM daily_pl WHERE date > '${dayjs().subtract(1, 'year').format('YYYY-MM-DD')}'`);
      populateCharts(rows);
    } catch (error) {
      console.error("Error in yearly-data:", error);
    }
  });

  ipcMain.on("all-data", async () => {
    try {
      [rows] = await connection.query("SELECT * FROM daily_pl");
      populateCharts(rows);
    } catch (error) {
      console.error("Error in all-data:", error);
    }
  });

  ipcMain.on("filterData", async (event, data) => {
    try {
      [rows] = await connection.query("SELECT * FROM daily_pl");
      rows = rows.filter((temp) => {
        return (
          dayjs(temp.date).isAfter(dayjs(data.startDate).subtract(1, "day")) &&
          dayjs(temp.date).isBefore(dayjs(data.endDate).add(1, "day"))
        );
      });
      populateCharts(rows);
    } catch (error) {
      console.error("Error in filterData:", error);
    }
  });

  function populateCharts(rows) {
    try {
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
    } catch (error) {
      console.error("Error in populateCharts:", error);
    }
  }

  // Helper functions for menu actions
  function createNewWindow(file = "add.html") {
    newWindow = new BrowserWindow({
      width: 600,
      height: 500,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        preload: path.join(__dirname + "/preload.js"),
      },
      parent: win,
      autoHideMenuBar: false,
    });
    newWindow.loadFile(file);
    if (file !== "add.html") newWindow.maximize();
    // newWindow.webContents.openDevTools();
    return newWindow;
  }

  function createIndividualStockWindow() {
    let individualStockWindow = new BrowserWindow({
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        preload: path.join(__dirname + "/preload.js"),
      },
      parent: win,
      autoHideMenuBar: false,
    });
    individualStockWindow.loadFile("individualStock.html");
    individualStockWindow.maximize();
    return individualStockWindow;
  }
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

const dayjs = require("dayjs");
const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const { createTursoClient } = require("./src/db/turso");
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
    connection = await createTursoClient();
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
    rows = sortDailyRows(rows);
    const data = rows.map((row) => Number(row.current_value) || 0);
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

  function getDailyChanges(rows) {
    const sortedRows = sortDailyRows(rows);
    return new Map(sortedRows.map((row, index) => {
      const previousValue = index > 0 ? Number(sortedRows[index - 1].current_value) : 0;
      const currentValue = Number(row.current_value);
      const change = index > 0 && Number.isFinite(previousValue) && Number.isFinite(currentValue)
        ? currentValue - previousValue
        : Number(row.daily_pl) || 0;
      return [row, change];
    }));
  }

  function getDailyPlDataForChart(rows, allRows = rows) {
    rows = sortDailyRows(rows);
    const dailyChanges = getDailyChanges(allRows);
    const dailyChartData = rows.map((row) => dailyChanges.get(row) || 0);
    
    function colors(opacity) {
      return dailyChartData.map((value) =>
        value < 0 ? `rgba(255, 110, 100, ${opacity})` : `rgba(0, 125, 10, ${opacity})`
      );
    }
    
    return {
      labels: rows.map((row) => new Date(row.date).toDateString()),
      datasets: [
        {
          label: "Change since previous entry (₹)",
          data: dailyChartData,
          borderColor: colors(1),
          backgroundColor: colors(.5),
          borderWidth: 1,
        },
      ],
    };
  }

  function getNiftyDataForChart(rows) {
    rows = sortDailyRows(rows);
    const firstNifty = Number(rows[0]?.nifty_50) || 0;
    const firstCurrentValue = Number(rows[0]?.current_value) || 0;
    return {
      labels: rows.map((row) => new Date(row.date).toDateString()),
      datasets: [
        {
          label: "Nifty",
          data: rows.map(
            (row) =>
              firstNifty ? ((Number(row.nifty_50) - firstNifty) * 100) / firstNifty : 0
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
              firstCurrentValue
                ? ((Number(row.current_value) - firstCurrentValue) * 100) / firstCurrentValue
                : 0
          ),
          borderColor: "rgba(0, 125, 10, 1)",
          backgroundColor: "rgba(0, 125, 10, .5)",
          pointStyle: false,
          tension: .2
        },
      ],
    };
  }  

  function sortDailyRows(rows) {
    return [...rows].sort(
      (a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf() || Number(a.id) - Number(b.id)
    );
  }

  function getPeriodRows(rows, amount, unit) {
    const sortedRows = sortDailyRows(rows);
    const latestDate = sortedRows[sortedRows.length - 1]?.date;
    if (!latestDate) return [];
    const cutoff = dayjs(latestDate).subtract(amount, unit);
    return sortedRows.filter((row) => !dayjs(row.date).isBefore(cutoff));
  }

  win.webContents.on("did-finish-load", async () => {
    try {
      win.totalInstruments = instruments.length;

      const [dailyRows] = await connection.query(
        "SELECT * FROM daily_pl ORDER BY date ASC, id ASC"
      );
      const rows = sortDailyRows(dailyRows);
      const dailyChanges = getDailyChanges(rows);

      const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
      const latest = rows[rows.length - 1];
      const previous = rows[rows.length - 2];
      const first = rows[0];
      const rangeBaseline = (amount, unit) => {
        if (!latest) return undefined;
        const cutoff = dayjs(latest.date).subtract(amount, unit);
        return [...rows].reverse().find((row) => !dayjs(row.date).isAfter(cutoff)) || first;
      };
      const changeMetric = (baseline, currentValue = latest?.current_value) => {
        if (!baseline || currentValue === undefined) return { text: "N/A", color: "gray" };
        const difference = number(currentValue) - number(baseline.current_value);
        const percent = number(baseline.current_value)
          ? (difference * 100 / number(baseline.current_value)).toFixed(2)
          : "N/A";
        return {
          text: `${difference.toFixed(2)} (${percent}%)`,
          color: difference > 0 ? "green" : difference < 0 ? "red" : "gray",
        };
      };
      const metrics = {
        "highest-profit": {
          text: rows.length
            ? [...dailyChanges.values()].reduce((highest, value) => Math.max(highest, value), -Infinity).toFixed(2)
            : "N/A",
          color: "green",
        },
        "lowest-profit": {
          text: rows.length
            ? [...dailyChanges.values()].reduce((lowest, value) => Math.min(lowest, value), Infinity).toFixed(2)
            : "N/A",
          color: "red",
        },
        "last-pl": latest
          ? {
              text: `${number(dailyChanges.get(latest)).toFixed(2)} (${previous && number(previous.current_value)
                ? (number(dailyChanges.get(latest)) * 100 / number(previous.current_value)).toFixed(2)
                : "N/A"}%)`,
              color: number(dailyChanges.get(latest)) > 0
                ? "green"
                : number(dailyChanges.get(latest)) < 0 ? "red" : "gray",
            }
          : { text: "N/A", color: "gray" },
        "total-pl": latest && first
          ? {
              text: `${number(latest.total_pl).toFixed(2)} (${number(first.current_value)
                ? (number(latest.total_pl) * 100 / number(first.current_value)).toFixed(2)
                : "N/A"}%)`,
              color: number(latest.total_pl) > 0 ? "green" : number(latest.total_pl) < 0 ? "red" : "gray",
            }
          : { text: "N/A", color: "gray" },
        "highest-value": rows.length
          ? changeMetric(
              first,
              rows.reduce((highest, row) => Math.max(highest, number(row.current_value)), -Infinity)
            )
          : { text: "N/A", color: "gray" },
        "last-week-change": changeMetric(rangeBaseline(1, "week")),
        "last-month-change": changeMetric(rangeBaseline(1, "month")),
        "1-year-returns": changeMetric(rangeBaseline(1, "year")),
      };

      let streakType;
      let currentStreak = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        const dailyReturn = number(dailyChanges.get(rows[i]));
        if (dailyReturn === 0) break;
        const currentType = dailyReturn > 0 ? "green" : "red";
        if (streakType && streakType !== currentType) break;
        streakType = currentType;
        currentStreak += 1;
      }
      metrics.streak = {
        text: currentStreak ? `${currentStreak} ${streakType === "green" ? "📈" : "📉"}` : "0",
        color: streakType || "gray",
      };

      await win.webContents.executeJavaScript(`
        const metrics = ${JSON.stringify(metrics)};
        Object.entries(metrics).forEach(([id, metric]) => {
          const element = document.getElementById(id);
          if (!element) return;
          element.textContent = metric.text;
          element.style.color = metric.color;
        });
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
      const [rows] = await connection.query("SELECT * FROM daily_pl ORDER BY date ASC, id ASC");
      populateCharts(getPeriodRows(rows, 1, "week"), rows);
    } catch (error) {
      console.error("Error in weekly-data:", error);
    }
  });

  ipcMain.on("monthly-data", async () => {
    try {
      const [rows] = await connection.query("SELECT * FROM daily_pl ORDER BY date ASC, id ASC");
      populateCharts(getPeriodRows(rows, 1, "month"), rows);
    } catch (error) {
      console.error("Error in monthly-data:", error);
    }
  });

  ipcMain.on("quarterly-data", async () => {
    try {
      const [rows] = await connection.query("SELECT * FROM daily_pl ORDER BY date ASC, id ASC");
      populateCharts(getPeriodRows(rows, 3, "months"), rows);
    } catch (error) {
      console.error("Error in quarterly-data:", error);
    }
  });

  ipcMain.on("yearly-data", async () => {
    try {
      const [rows] = await connection.query("SELECT * FROM daily_pl ORDER BY date ASC, id ASC");
      populateCharts(getPeriodRows(rows, 1, "year"), rows);
    } catch (error) {
      console.error("Error in yearly-data:", error);
    }
  });

  ipcMain.on("all-data", async () => {
    try {
      const [rows] = await connection.query("SELECT * FROM daily_pl ORDER BY date ASC, id ASC");
      populateCharts(rows, rows);
    } catch (error) {
      console.error("Error in all-data:", error);
    }
  });

  ipcMain.on("filterData", async (event, data) => {
    try {
      const [allRows] = await connection.query("SELECT * FROM daily_pl ORDER BY date ASC, id ASC");
      const rows = allRows.filter((temp) => {
        return (
          dayjs(temp.date).isAfter(dayjs(data.startDate).subtract(1, "day")) &&
          dayjs(temp.date).isBefore(dayjs(data.endDate).add(1, "day"))
        );
      });
      populateCharts(rows, allRows);
    } catch (error) {
      console.error("Error in filterData:", error);
    }
  });

  function populateCharts(rows, allRows = rows) {
    try {
      rows = sortDailyRows(rows);
      if (rows.length === 0) return;

      win.webContents.executeJavaScript(`
      ctx = document.getElementById('current-chart').getContext('2d');
      void new Chart(ctx, {
        type: 'line',
        data: ${JSON.stringify(getCurrentDataForChart(rows))}
      });
      `);

      win.webContents.executeJavaScript(`
      ctx2 = document.getElementById('daily-chart').getContext('2d');
      void new Chart(ctx2, {
        type: 'bar',
        data: ${JSON.stringify(getDailyPlDataForChart(rows, allRows))}
      });
      `);

      win.webContents.executeJavaScript(`
      ctx3 = document.getElementById('nifty-chart').getContext('2d');
      void new Chart(ctx3, {
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

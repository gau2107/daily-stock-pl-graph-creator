const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");
const { getRandomColor, colors } = require("./src/utils/utils");
const dayjs = require("dayjs");

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });

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
    
  } catch (error) {
    console.error("Database connection failed:", error);
    connection = null;
    // Don't show alert immediately, let the user try operations first
  }
})();

async function getData(duration, typeOfDuration) {
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
    
    // Check if connection exists before proceeding
    if (!connection) {
      console.error("No database connection available");
      alert("Database connection not available. Please restart the application.");
      return;
    }

    Chart.helpers.each(Chart.instances, (chart) => {
      chart.destroy();
    });
    
    const row = document.getElementById("row");
    while (row.firstChild) {
      row.removeChild(row.firstChild);
    }

    let query = `SELECT
      s.name AS sector_name,
      i.name AS instrument_name,
      h.date,
      h.qty,
      h.avg_cost,
      h.ltp,
      h.cur_val,
      h.p_l,
      h.net_chg,
      h.day_chg
  FROM
      sector AS s
  INNER JOIN instrument AS i
  ON
      s.id = i.sector_id
  INNER JOIN holdings AS h
  ON
      i.id = h.instrument_id 
      WHERE i.is_active = true`;

    if (duration && typeOfDuration) {
      query += ` AND h.date > '${dayjs().subtract(duration, typeOfDuration).format('YYYY-MM-DD')}'`;
    }

    const [rows] = await connection.query(query);

    let sectorGroupArray = [];
    
    try {
      rows.forEach((rowData) => {
        // find by sector
        let sectorObj = sectorGroupArray.findIndex((p) => p.sector === rowData.sector_name);
        if (sectorObj >= 0) {
          //true
          // find by instrument
          let instrumentObj = sectorGroupArray[sectorObj].instruments.findIndex(
            (p) => p.instrument === rowData.instrument_name
          );
          if (instrumentObj >= 0) {
            //true
            sectorGroupArray[sectorObj].instruments[instrumentObj].data.push({
              cur_val: rowData.cur_val,
              p_l: rowData.p_l,
              date: rowData.date,
              net_chg: rowData.net_chg,
              day_chg: rowData.day_chg,
            });
          } else {
            //new instrument
            sectorGroupArray[sectorObj].instruments.push({
              instrument: rowData.instrument_name,
              data: [
                {
                  cur_val: rowData.cur_val,
                  p_l: rowData.p_l,
                  date: rowData.date,
                  net_chg: rowData.net_chg,
                  day_chg: rowData.day_chg,
                },
              ],
            });
          }
          sectorGroupArray[sectorObj].net_percent = sectorGroupArray[sectorObj].instruments.reduce(
            (acc, instrument) =>
              parseFloat(instrument.data[instrument.data.length - 1].net_chg) + acc,
            0
          );
          sectorGroupArray[sectorObj].p_l = sectorGroupArray[sectorObj].instruments.reduce(
            (acc, instrument) =>
              parseFloat(instrument.data[instrument.data.length - 1].p_l) + acc,
            0
          );
          sectorGroupArray[sectorObj].cur_val = sectorGroupArray[sectorObj].instruments.reduce(
            (acc, instrument) =>
              parseFloat(instrument.data[instrument.data.length - 1].cur_val) + acc,
            0
          );

          sectorGroupArray[sectorObj].net_percent =
            sectorGroupArray[sectorObj].net_percent.toFixed(2);
          sectorGroupArray[sectorObj].p_l = sectorGroupArray[sectorObj].p_l.toFixed(2);
          sectorGroupArray[sectorObj].cur_val = sectorGroupArray[sectorObj].cur_val.toFixed(2);
        } else {
          // new sector
          sectorGroupArray.push({
            sector: rowData.sector_name,
            instruments: [
              {
                instrument: rowData.instrument_name,
                data: [
                  {
                    cur_val: rowData.cur_val,
                    p_l: rowData.p_l,
                    date: rowData.date,
                    net_chg: rowData.net_chg,
                    day_chg: rowData.day_chg,
                  },
                ],
              },
            ],
            net_percent: rowData.net_chg,
            p_l: rowData.p_l,
            cur_val: rowData.cur_val,
          });
        }
      });
    } catch (error) {
      console.error("Error processing data rows:", error);
      alert("Error processing data. Please try again.");
      return;
    }

    let copiedSectorGroupArray = JSON.parse(JSON.stringify(sectorGroupArray));

    try {
      copiedSectorGroupArray.forEach((sectorObj) => {
        sectorObj.graph = [];
        sectorObj.dates = [];
        sectorObj.dayChg = [];
        sectorObj.plArray = [];
        sectorObj.curValArray = [];
        sectorObj.investedVal = [];
        sectorObj.changePercent = [];
        sectorObj.instrumentNames = [];
        sectorObj.invested_val = sectorObj.cur_val - sectorObj.p_l
        let individualInstrumentArrayLength = 0;

        sectorObj.instruments.map((instrumentObj, parentIndex) => {
          individualInstrumentArrayLength = instrumentObj.data.length > individualInstrumentArrayLength ? instrumentObj.data.length : individualInstrumentArrayLength;
          if (instrumentObj.data.length < individualInstrumentArrayLength) {
            let lengthDifference = individualInstrumentArrayLength - instrumentObj.data.length;
            let temp = { cur_val: 0, net_chg: 0 };
            for (let i = 0; i < lengthDifference; i++) {
              instrumentObj.data.unshift(temp);
            }
          }
          instrumentObj.data.map((individualInstrumentObj, index) => {
            individualInstrumentObj.cur_val = parseFloat(individualInstrumentObj.cur_val)
            if (parentIndex === 0) {
              sectorObj.graph.push(parseFloat(individualInstrumentObj.net_chg));
              sectorObj.investedVal.push(individualInstrumentObj.cur_val - individualInstrumentObj.p_l);
              sectorObj.curValArray.push(individualInstrumentObj.cur_val);
              sectorObj.plArray.push(parseFloat(individualInstrumentObj.p_l));
              sectorObj.changePercent.push(((sectorObj.curValArray[sectorObj.curValArray.length - 1] - parseFloat(sectorObj.investedVal[index])) * 100) / parseFloat(sectorObj.investedVal[index]));
              sectorObj.dates.push(new Date(individualInstrumentObj.date).toDateString());
              individualInstrumentObj.color = getRandomColor();
            } else {
              sectorObj.graph[index] = (
                parseFloat(sectorObj.graph[index]) + parseFloat(individualInstrumentObj.net_chg)
              ).toFixed(2);

              sectorObj.investedVal[index] = (
                parseFloat(sectorObj.investedVal[index]) + (individualInstrumentObj.cur_val - individualInstrumentObj.p_l || 0)
              );

              sectorObj.curValArray[index] = (
                parseFloat(sectorObj.curValArray[index]) + individualInstrumentObj.cur_val
              ).toFixed(2);

              sectorObj.plArray[index] = (
                parseFloat(sectorObj.plArray[index]) + (parseFloat(individualInstrumentObj.p_l) || 0)
              )

              sectorObj.changePercent[index] = (((sectorObj.curValArray[index] - parseFloat(sectorObj.investedVal[index])) * 100) / parseFloat(sectorObj.investedVal[index]));
            }

            if (index === 0) {
              individualInstrumentObj.percentChange = 0; // Initial value
            } else {
              const prevCurVal = instrumentObj.data[index - 1].cur_val;
              const curCurVal = individualInstrumentObj.cur_val;
              individualInstrumentObj.percentChange = ((curCurVal - prevCurVal) / prevCurVal) * 100;
            }
          });
          sectorObj.instrumentNames.push(instrumentObj.instrument);
        });
        sectorObj.color = getRandomColor();
        for (let i = 0; i < sectorObj.plArray.length; i++) {
          let res = i === 0 ? i : i - 1;
          sectorObj.dayChg.push(sectorObj.plArray[i] - sectorObj.plArray[res])
        }
      });
    } catch (error) {
      console.error("Error processing sector data:", error);
      alert("Error processing sector data. Please try again.");
      return;
    }

    try {
      for (let i = 0; i < copiedSectorGroupArray.length; i++) {
        generateBarChart(copiedSectorGroupArray[i]);
      }
      doughnutChart(copiedSectorGroupArray);
      compareChart(copiedSectorGroupArray);
    } catch (error) {
      console.error("Error generating charts:", error);
      alert("Error generating charts. Please try again.");
    }

  } catch (error) {
    console.error("Database query error:", error);
    alert("Failed to fetch data from database. Please check your connection.");
  }
}

function doughnutChart(sectorGroupArray) {
  try {
    const labels = sectorGroupArray.map((item) => item.sector);
    const values = sectorGroupArray.map((item) => parseInt(item.cur_val));
    const data = {
      labels: labels,
      datasets: [
        {
          data: values,
          backgroundColor: sectorGroupArray.map((item) => item.color),
          borderColor: sectorGroupArray.map((item) => item.color),
          borderWidth: 1,
        },
      ],
    };
    const config = {
      type: "doughnut",
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: 98,
        plugins: {
          legend: {
            position: "top",
          },
          title: {
            display: true,
            text: "Holdings doughnut",
          },
        },
      },
    };

    const chartCanvas = document.getElementById("doughnut-chart");
    if (chartCanvas) {
      new Chart(chartCanvas, config);
    } else {
      console.error("Doughnut chart canvas not found");
    }
  } catch (error) {
    console.error("Error creating doughnut chart:", error);
  }
}

function compareChart(sectorGroupArray) {
  try {
    const labels = sectorGroupArray.map((item) => item.sector);
    const currentValues = sectorGroupArray.map((item) => item.cur_val);
    const investedValues = sectorGroupArray.map(
      (item) => item.invested_val
    );
    const data = {
      labels: labels,
      datasets: [
        {
          label: "Invested value",
          data: investedValues,
          backgroundColor: "rgba(41, 128, 185, .5)",
          borderColor: "rgba(41, 128, 185, 1)",
          borderWidth: 1,
        },
        {
          label: "Current value",
          data: currentValues,
          backgroundColor: "rgba(39, 174, 96, .5)",
          borderColor: "rgba(39, 174, 96, 1)",
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
    const chartCanvas = document.getElementById("compare-chart");
    if (chartCanvas) {
      new Chart(chartCanvas, config);
    } else {
      console.error("Compare chart canvas not found");
    }
  } catch (error) {
    console.error("Error creating compare chart:", error);
  }
}

function generateBarChart(value) {
  try {
    let label = (value.dayChg.filter(day_chg => day_chg > 0).length * 100 / value.dayChg.length).toFixed(2);
    value.dates.shift();
    value.dayChg.shift();
    const data = {
      labels: value.dates,
      datasets: [
        {
          label: `${value.sector} (${value.instrumentNames.join(", ")})(${label}%)`,
          data: value.dayChg,
          borderColor: colors(value.dayChg, 1),
          backgroundColor: colors(value.dayChg, 0.5),
          borderWidth: 1,
        }
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
    const div = document.createElement("div");
    div.className = "col-md-6";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    new Chart(ctx, config);
    const row = document.getElementById("row");
    if (row) {
      row.appendChild(div);
      div.appendChild(canvas);
    } else {
      console.error("Row element not found");
    }
  } catch (error) {
    console.error("Error generating bar chart:", error);
  }
}

const weeklyBtn = document.getElementById("weekly");
const monthlyBtn = document.getElementById("monthly");
const quarterlyBtn = document.getElementById("quarterly");
const yearlyBtn = document.getElementById("yearly");
const allBtn = document.getElementById("all");

weeklyBtn.addEventListener("click", (event) => {
  try {
    handleActiveClass(weeklyBtn);
    getData(8, 'days');
  } catch (error) {
    console.error("Error handling weekly button click:", error);
  }
});

monthlyBtn.addEventListener("click", (event) => {
  try {
    handleActiveClass(monthlyBtn);
    getData(1, 'month');
  } catch (error) {
    console.error("Error handling monthly button click:", error);
  }
});

quarterlyBtn.addEventListener("click", (event) => {
  try {
    handleActiveClass(quarterlyBtn);
    getData(3, 'months');
  } catch (error) {
    console.error("Error handling quarterly button click:", error);
  }
});

yearlyBtn.addEventListener("click", (event) => {
  try {
    handleActiveClass(yearlyBtn);
    getData(1, 'year');
  } catch (error) {
    console.error("Error handling yearly button click:", error);
  }
});

allBtn.addEventListener("click", () => {
  try {
    handleActiveClass(allBtn);
    getData();
  } catch (error) {
    console.error("Error handling all button click:", error);
  }
});

function handleActiveClass(element) {
  try {
    weeklyBtn.classList.replace("btn-dark", "btn-secondary");
    monthlyBtn.classList.replace("btn-dark", "btn-secondary");
    quarterlyBtn.classList.replace("btn-dark", "btn-secondary");
    yearlyBtn.classList.replace("btn-dark", "btn-secondary");
    allBtn.classList.replace("btn-dark", "btn-secondary");
    element.classList.replace("btn-secondary", "btn-dark");
  } catch (error) {
    console.error("Error handling active class:", error);
  }
}

try {
  // Add connection check before initial getData call
  if (connectionPromise) {
    connectionPromise.then(() => {
      getData(3, 'months');
    }).catch((error) => {
      console.error("Error initializing data:", error);
      alert("Failed to load initial data. Please refresh the page.");
    });
  } else {
    getData(3, 'months');
  }
} catch (error) {
  console.error("Error initializing data:", error);
  alert("Failed to load initial data. Please refresh the page.");
}

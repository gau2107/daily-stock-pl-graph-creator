const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");
const { getRandomColor, colors } = require("./src/utils/utils");

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });
const dbConnectionString = process.env.DB_CONNECTION_STRING;

let connection;
async function getData() {
  connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: dbConnectionString,
  });

  [rows] = await connection.query(`SELECT
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
    i.id = h.instrument_id where i.is_active = true;`);

  let sectorGroupArray = [];
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

  let copiedSectorGroupArray = JSON.parse(JSON.stringify(sectorGroupArray));

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
  let len = copiedSectorGroupArray[0].graph.length;
  [stockRows] = await connection.query(
    `SELECT nifty_50 FROM daily_pl ORDER BY id DESC LIMIT ${len};`
  );
  [firstNifty] = await connection.query(
    `SELECT nifty_50 FROM daily_pl WHERE id = 1;`
  );
  let stockData = [...stockRows.reverse()];
  let finalData = stockData.map(
    (s) =>
      ((s.nifty_50 - firstNifty[0].nifty_50) * 100) / firstNifty[0].nifty_50
  );
  for (let i = 0; i < copiedSectorGroupArray.length; i++) {
    generateChart(copiedSectorGroupArray[i], finalData);
  }
  for (let i = 0; i < copiedSectorGroupArray.length; i++) {
    generateBarChart(copiedSectorGroupArray[i]);
  }
  doughnutChart(copiedSectorGroupArray);
  compareChart(copiedSectorGroupArray);
}

function doughnutChart(sectorGroupArray) {
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
  new Chart(chartCanvas, config);
}
function compareChart(sectorGroupArray) {
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
  new Chart(chartCanvas, config);
}



function generateChart(value, stockRows) {
  const data = {
    labels: value.dates,
    datasets: [
      {
        label: `${value.sector} (${value.instrumentNames.join(", ")})(${value.changePercent[value.changePercent.length - 1].toFixed(2)}%)`,
        data: value.changePercent,
        backgroundColor: value.color,
        borderColor: value.color,
        pointStyle: false,
        tension: .2
      },
      {
        label: "Nifty 50",
        data: stockRows,
        backgroundColor: "rgba(200, 100, 100, .5)",
        borderColor: "rgba(200, 100, 100, 1)",
        pointStyle: false,
        tension: .2
      },
    ],
  };
  const config = {
    type: "line",
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
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  new Chart(ctx, config);
  const container = document.getElementById("container");
  container.appendChild(canvas);
}

function generateBarChart(value) {
  let label = (value.dayChg.filter(day_chg => day_chg > 0).length * 100 / value.dayChg.length).toFixed(2);
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
  row.appendChild(div);
  div.appendChild(canvas);
}
getData();

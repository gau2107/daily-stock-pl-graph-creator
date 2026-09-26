const { createTursoClient } = require("./src/db/turso");
const dotenv = require("dotenv");
const path = require("path");
const dayjs = require("dayjs");

const { getRandomColor } = require("./src/utils/utils");

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });

let totalInstruments = 0;
let backgroundColors;
let holdingsByDate = [];
let playbackIndex = 0;
let playbackTimer;
let isPlayingHistory = false;
let disableChartAnimations = false;

// table data
function displayData(parentData, instruments) {
  const itemsPerPage = 10;
  const dataBody = document.getElementById('dataBody');
  const tableHead = document.getElementById('tableHead');
  const pagination = document.getElementById('pagination');

  const totalPages = Math.ceil(parentData.length / itemsPerPage);
  tableHead.innerHTML = '<th scope="col">Date</th>';
  for (let i = 0; i < instruments.length; i++) {
    const cell = document.createElement('th');
    cell.scope = "col";
    cell.textContent = instruments[i]['instrument'];
    tableHead.appendChild(cell);

  }
  // Function to display a specific page
  async function displayPage(pageNumber) {
    const data = [...parentData].sort((a, b) => new Date(b.date) - new Date(a.date));

    dataBody.innerHTML = ''; // Clear the table body

    // Calculate the starting and ending index of the items for the current page
    const startIndex = (pageNumber - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;


    // Loop through the items of the current page and populate the table
    for (let i = startIndex; i < endIndex && i < data.length; i++) {
      const row = document.createElement('tr');

      // Loop through each key in the object
      data[i]['date'] = new Date(data[i]['date']).toDateString()
      const cell = document.createElement('td');
      cell.textContent = data[i]['date'];
      row.appendChild(cell);
      for (let j = 0; j < instruments.length; j++) {
        const content = data[i]['data'].find((d) => d.instrument === instruments[j].instrument);
        const cell = document.createElement('td');

        // Calculate dynamic returns based on previous price
        let dayChange = 0;
        if (content && i < data.length - 1) {
          const previousDayContent = data[i + 1]['data'].find((d) => d.instrument === instruments[j].instrument);
          if (previousDayContent && previousDayContent.ltp && content.ltp) {
            dayChange = ((content.ltp - previousDayContent.ltp) / previousDayContent.ltp) * 100;
          }
        }

        cell.textContent = content && dayChange !== 0 ? dayChange.toFixed(2) + '%' : '-';
        cell.style.color = dayChange > 0 ? 'green' : 'red';
        cell.style.backgroundColor = dayChange > 1 ? 'rgba(0, 255, 0, .08)' : dayChange > 0 ? 'rgba(0, 255, 0, .03)' : dayChange < -1 ? 'rgba(255, 0, 0, 0.08)' : 'rgba(255, 0, 0, .03)';
        row.appendChild(cell);
      }



      dataBody.appendChild(row);
    }
  }

  // Function to create pagination links
  function createPaginationLinks() {
    pagination.innerHTML = ''; // Clear the pagination links

    // Create and append the pagination links
    for (let i = 1; i <= totalPages; i++) {
      const link = document.createElement('li');
      link.classList.add('page-item');
      link.innerHTML = `<a class="page-link" href="#">${i}</a>`;
      link.addEventListener('click', (event) => {
        // Prevent the default behavior of the click event
        event.preventDefault();
        displayPage(i);
      });
      pagination.appendChild(link);
    }
  }

  // Display the first page initially
  displayPage(1);

  // Create the pagination links
  createPaginationLinks();
}

function doughnutChart(rows) {
  const labels = rows.map((item) => item.instrument);
  const values = rows.map((item) => item.cur_val);
  const data = {
    labels: labels,
    datasets: [
      {
        data: values,
        backgroundColor: backgroundColors,
        borderColor: backgroundColors,
        borderWidth: 1,
      },
    ],
  };
  const config = {
    type: "doughnut",
    data: data,
    options: {
      responsive: true,
      animation: disableChartAnimations ? false : undefined,
      maintainAspectRatio: false,
      cutout: 98,
      plugins: {
        legend: {
          position: "top",
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = parseFloat(context.raw || 0);
              const total = context.dataset.data.reduce((sum, item) => sum + parseFloat(item || 0), 0);
              return `${context.label}: ${value.toFixed(2)} (${total ? (value * 100 / total).toFixed(2) : "0.00"}%)`;
            },
          },
        },
        title: {
          display: true,
          text: "Holdings",
        },
      },
    },
  };

  const chartCanvas = document.getElementById("doughnut-chart");
  new Chart(chartCanvas, config);
}

function compareChart(rows) {
  const labels = rows.map((item) => item.instrument);
  const currentValues = rows.map((item) => item.cur_val);
  const investedValues = rows.map((item) => item.cur_val - item.p_l);
  const totalInvested = investedValues.reduce((sum, value) => sum + parseFloat(value || 0), 0);
  const totalCurrent = currentValues.reduce((sum, value) => sum + parseFloat(value || 0), 0);
  const totalReturn = totalInvested ? ((totalCurrent - totalInvested) * 100 / totalInvested).toFixed(2) : "0.00";
  const data = {
    labels: labels,
    datasets: [
      {
        label: `Invested value ${totalInvested.toFixed(2)}`,
        data: investedValues,
        backgroundColor: "rgba(41, 128, 185, .5)",
        borderColor: "rgba(41, 128, 185, 1)",
        borderWidth: 1,
      },
      {
        label: `Current value ${totalCurrent.toFixed(2)} (${totalReturn}%)`,
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
      animation: disableChartAnimations ? false : undefined,
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

function plChart(rows) {
  const labels = rows.map((item) => item.instrument);
  const values = rows.map(
    (item) => (100 * item.p_l) / (item.cur_val - item.p_l || 1)
  );
  const colors = values.map((row) =>
    row < 0 ? "rgba(255, 110, 100, .5)" : "rgba(0, 125, 10, .5)"
  );
  const data = {
    labels: labels,
    datasets: [
      {
        label: "Current profit / loss %",
        data: values,
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 1,
      },
    ],
  };
  const config = {
    type: "bar",
    data: data,
    options: {
      responsive: true,
      animation: disableChartAnimations ? false : undefined,
      plugins: {
        legend: {
          position: "top",
        },
      },
    },
  };
  const chartCanvas = document.getElementById("pl-chart");
  new Chart(chartCanvas, config);
}

function plValueChart(rows) {
  const labels = rows.map((item) => item.instrument);
  const values = rows.map((item) => item.p_l);
  const colors = values.map((row) =>
    row < 0 ? "rgba(255, 110, 100, .5)" : "rgba(0, 125, 10, .5)"
  );
  const data = {
    labels: labels,
    datasets: [
      {
        label: "Current profit / loss",
        data: values,
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 1,
      },
    ],
  };
  const config = {
    type: "bar",
    data: data,
    options: {
      responsive: true,
      animation: disableChartAnimations ? false : undefined,
      plugins: {
        legend: {
          position: "top",
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const row = rows[context.dataIndex];
              const invested = parseFloat(row.cur_val || 0) - parseFloat(row.p_l || 0);
              const percentage = invested ? (parseFloat(row.p_l || 0) * 100 / invested).toFixed(2) : "0.00";
              return `${context.label}: ${parseFloat(context.raw || 0).toFixed(2)} (${percentage}%)`;
            },
          },
        },
      },
    },
  };
  const chartCanvas = document.getElementById("pl-value-chart");
  new Chart(chartCanvas, config);
}

function allHoldingsChart(rows, instruments, isRunningFirstTime) {
  const groupedData = rows.reduce((acc, obj) => {
    const date = new Date(obj.date).getTime();
    const existingGroup = acc.find(
      (group) => new Date(group.date).getTime() === date
    );
    if (existingGroup)
      existingGroup.data.push(obj);
    else
      acc.push({ date: date, data: [obj] });

    return acc;
  }, []);

  const labels = groupedData.map((data) => new Date(data.date).toDateString());
  function getPercent(found) {
    if (found) return (100 * found.p_l) / (found.cur_val - found.p_l || 1);
    else return undefined;
  }
  function generateDataSets(type, label, hidden) {
    let color = getRandomColor();
    let arr = [];
    for (let i = 0; i < groupedData.length; i++) {
      let found = groupedData[i].data.find((x) => x.instrument === label);
      let cal = type === "daily" ? found?.day_chg : getPercent(found);
      arr.push(cal);
    }

    return {
      label: label,
      data: arr,
      backgroundColor: color,
      borderColor: color,
      pointStyle: false,
      tension: .2,
      hidden: hidden
    };
  }


  const chartCanvas1 = document.getElementById("total-chart");
  new Chart(chartCanvas1, getConfig("total"));

  function getConfig(type) {
    let dataset = [];
    for (let i = 0; i < totalInstruments; i++) {
      let label = groupedData[groupedData.length - 1]?.data[i]?.instrument;
      dataset.push(generateDataSets(type, label, i !== 0));
    }
    const data = {
      labels: labels,
      datasets: dataset,
    };
    return {
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
  }
}

function updateSnapshotCharts(rows) {
  ["doughnut-chart", "compare-chart", "pl-chart", "pl-value-chart"].forEach((id) => {
    const chart = Chart.getChart(document.getElementById(id));
    if (chart) chart.destroy();
  });

  doughnutChart(rows);
  compareChart(rows);
  plChart(rows);
  plValueChart(rows);
}

function renderPlaybackFrame(index) {
  const entry = holdingsByDate[index];
  if (!entry) return;

  updateSnapshotCharts(entry.data);
  document.getElementById("playback-date").textContent = dayjs(entry.date).format("D MMM YYYY");
}

function playNextHistoryEntry() {
  if (!isPlayingHistory) return;

  if (playbackIndex >= holdingsByDate.length) {
    isPlayingHistory = false;
    disableChartAnimations = false;
    document.getElementById("play-history").textContent = "Play";
    return;
  }

  renderPlaybackFrame(playbackIndex);
  playbackIndex += 1;
  playbackTimer = setTimeout(playNextHistoryEntry, 900);
}

const playHistoryButton = document.getElementById("play-history");
playHistoryButton.addEventListener("click", () => {
  if (isPlayingHistory) {
    isPlayingHistory = false;
    disableChartAnimations = false;
    clearTimeout(playbackTimer);
    playHistoryButton.textContent = "Play";
    return;
  }

  if (holdingsByDate.length === 0) return;
  if (playbackIndex >= holdingsByDate.length) playbackIndex = 0;
  isPlayingHistory = true;
  disableChartAnimations = true;
  playHistoryButton.textContent = "Pause";
  playNextHistoryEntry();
});

// Code for when user click on filter btn which contains start and end date
const filterBtn = document.getElementById("filter");
filterBtn.addEventListener("click", async () => {
  const startDate = document.getElementById("start-date").value;
  const endDate = document.getElementById("end-date").value;
  if (!startDate || !endDate) return;
  getDataAsPerStartEndDate(startDate, endDate);

});

async function getDataAsPerStartEndDate(startDate, endDate, isRunningFirstTime) {
  let chartId = document.getElementById('total-chart');
  var context = chartId.getContext('2d');
  Chart.helpers.each(Chart.instances, function (instance) {
    if (instance.ctx === context) {
      instance.destroy();
      return;
    }
  });

  connection = await createTursoClient();

  let [allInstruments] = await connection.query(
    `SELECT h.id, h.date, h.qty, h.avg_cost, h.ltp, h.cur_val, h.p_l, h.net_chg, h.day_chg,
      i.name AS instrument, i.sector_id, i.id as instrumentId FROM holdings AS h INNER JOIN instrument AS i ON
      h.instrument_id = i.id WHERE i.is_active = true ORDER BY h.id DESC LIMIT ${totalInstruments};`
  );

  allInstruments = allInstruments.sort((a, b) => a.instrumentId - b.instrumentId);
  if (isRunningFirstTime) {
    const [historyRows] = await connection.query(
      `SELECT h.id, h.date, h.qty, h.avg_cost, h.ltp, h.cur_val, h.p_l, h.net_chg, h.day_chg,
        i.name AS instrument, i.sector_id, i.id AS instrumentId
      FROM holdings AS h INNER JOIN instrument AS i ON h.instrument_id = i.id
      WHERE i.is_active = true
      ORDER BY h.date ASC, h.id ASC;`
    );
    const historyByDate = new Map();
    historyRows.forEach((row) => {
      const date = dayjs(row.date).format("YYYY-MM-DD");
      if (!historyByDate.has(date)) historyByDate.set(date, []);
      historyByDate.get(date).push(row);
    });
    const groupedHistory = Array.from(historyByDate, ([date, data]) => ({
      date,
      data: data.sort((a, b) => a.instrumentId - b.instrumentId),
    }));
    holdingsByDate = groupedHistory;
    displayData(groupedHistory, allInstruments);
    playHistoryButton.disabled = groupedHistory.length === 0;
  }

  let [allRows] = await connection.query(
    `SELECT h.id, h.date, h.qty, h.avg_cost, h.ltp, h.cur_val, h.p_l, h.net_chg, h.day_chg, i.name AS instrument, i.sector_id
    FROM holdings AS h INNER JOIN instrument AS i ON h.instrument_id = i.id 
    WHERE h.date > '${dayjs(startDate).format('YYYY-MM-DD')}' 
    AND h.date <= '${dayjs(endDate).format('YYYY-MM-DD')}' 
    AND i.is_active = true;`
  );

  if (isRunningFirstTime) {
    let arr = Array(totalInstruments).fill(0);
    backgroundColors = arr.map(() => getRandomColor());
    doughnutChart(allInstruments);
    compareChart(allInstruments);
    plChart(allInstruments);
    plValueChart(allInstruments);
  }

  allHoldingsChart(allRows, allInstruments, isRunningFirstTime)
}

// Code execution starts here. Load the instrument count before building queries
// that use it for pagination.
(async function initializeHoldings() {
  try {
    const connection = await createTursoClient();
    const [instrumentCount] = await connection.query(
      "SELECT COUNT(*) AS count FROM instrument WHERE is_active = true"
    );
    totalInstruments = Number(instrumentCount[0]?.count || 0);

    await getDataAsPerStartEndDate(
      dayjs().subtract(3, "months").format("YYYY-MM-DD"),
      dayjs().format("YYYY-MM-DD"),
      true
    );
  } catch (error) {
    console.error("Failed to initialize holdings page:", error);
  }
})();

const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");
const dayjs = require("dayjs");

const { ipcRenderer } = require("electron");

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });
const dbConnectionString = process.env.DB_CONNECTION_STRING;

let totalInstruments;
ipcRenderer.send("get-total-instruments");

ipcRenderer.on("total-instruments", (event, data) => {
  totalInstruments = data;
});
let backgroundColors;
function getRandomColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}
async function getData() {
  const connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: dbConnectionString,
  });

  [rows] = await connection.query(
    `SELECT h.id, h.date, h.qty, h.avg_cost, h.ltp, h.cur_val, h.p_l, h.net_chg, h.day_chg,
      i.name AS instrument, i.sector_id FROM holdings AS h INNER JOIN instrument AS i ON
      h.instrument_id = i.id WHERE i.is_active = true ORDER BY id DESC LIMIT ${totalInstruments};`
  );
  let arr = Array(totalInstruments).fill(0);
  backgroundColors = arr.map(() => getRandomColor());
  doughnutChart(rows);
  compareChart(rows);
  plChart(rows);
  plValueChart(rows);

  [allRows] = await connection.query(
    `SELECT h.id, h.date, h.qty, h.avg_cost, h.ltp, h.cur_val, h.p_l, h.net_chg, h.day_chg, i.name AS instrument, i.sector_id
    FROM holdings AS h INNER JOIN instrument AS i ON h.instrument_id = i.id WHERE i.is_active = true;`
  );
  allHoldingsChart(allRows, rows, true);
}

function displayData(parentData, instruments) {
  const itemsPerPage = 10; // Number of items to display per page
  const dataBody = document.getElementById('dataBody');
  const tableHead = document.getElementById('tableHead');
  const pagination = document.getElementById('pagination');

  // Calculate the number of pages
  const totalPages = Math.ceil(parentData.length / itemsPerPage);

  for (let i = 0; i < instruments.length; i++) {
    const cell = document.createElement('th');
    cell.scope = "col";
    cell.textContent = instruments[i]['instrument'];
    tableHead.appendChild(cell);

  }
  // Function to display a specific page
  function displayPage(pageNumber) {
    let data = JSON.parse(JSON.stringify(parentData)).reverse();

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
        cell.textContent = content?.day_chg ? parseFloat(content?.day_chg)?.toFixed(2) + '%' : '-';
        cell.style.color = content?.day_chg > 0 ? 'green' : 'red';
        cell.style.backgroundColor = content?.day_chg > 1 ? 'rgba(0, 255, 0, .08)' : content?.day_chg > 0 ? 'rgba(0, 255, 0, .03)' :  content?.day_chg < -1 ? 'rgba(255, 0, 0, 0.08)' : 'rgba(255, 0, 0, .03)';
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

function doughnutChart() {
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

function compareChart(rows) {
  const labels = rows.map((item) => item.instrument);
  const values = rows.map((item) => item.cur_val);
  const values1 = rows.map((item) => item.avg_cost * item.qty);
  const data = {
    labels: labels,
    datasets: [
      {
        label: "Invested value",
        data: values1,
        backgroundColor: "rgba(41, 128, 185, .5)",
        borderColor: "rgba(41, 128, 185, 1)",
        borderWidth: 1,
      },
      {
        label: "Current value",
        data: values,
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

function plChart(rows) {
  const labels = rows.map((item) => item.instrument);
  const values = rows.map(
    (item) => (100 * item.p_l) / (item.avg_cost * item.qty)
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
  const values = rows.map((item) => item.cur_val - item.avg_cost * item.qty);
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
      plugins: {
        legend: {
          position: "top",
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
    if (existingGroup) {
      existingGroup.data.push(obj);
    } else {
      acc.push({ date: date, data: [obj] });
    }
    return acc;
  }, []);

  const labels = groupedData.map((data) => new Date(data.date).toDateString());
  if (isRunningFirstTime) displayData(groupedData, instruments);

  function getPercent(found) {
    if (found) return (100 * found.p_l) / (found.avg_cost * found.qty);
    else return 0;
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

const filterBtn = document.getElementById("filter");
filterBtn.addEventListener("click", async () => {
  const startDate = document.getElementById("start-date").value;
  const endDate = document.getElementById("end-date").value;
  if (!startDate || !endDate) return;
  let chartId = document.getElementById('total-chart');
  var context = chartId.getContext('2d');
  Chart.helpers.each(Chart.instances, function (instance) {
    if (instance.ctx === context) {
      instance.destroy();
      return;
    }
  });

  const connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: dbConnectionString,
  });

  let [rows] = await connection.query(
    `SELECT h.id, h.date, h.qty, h.avg_cost, h.ltp, h.cur_val, h.p_l, h.net_chg, h.day_chg,
      i.name AS instrument, i.sector_id FROM holdings AS h INNER JOIN instrument AS i ON
      h.instrument_id = i.id WHERE i.is_active = true ORDER BY id DESC LIMIT ${totalInstruments};`
  );

  let [allRows] = await connection.query(
    `SELECT h.id, h.date, h.qty, h.avg_cost, h.ltp, h.cur_val, h.p_l, h.net_chg, h.day_chg, i.name AS instrument, i.sector_id
    FROM holdings AS h INNER JOIN instrument AS i ON h.instrument_id = i.id WHERE i.is_active = true;`
  );
  const temp = allRows.filter((temp) => {
    return (
      dayjs(temp.date).isAfter(dayjs(startDate).subtract(1, "day")) &&
      dayjs(temp.date).isBefore(dayjs(endDate).add(1, "day"))
    );
  });
  allHoldingsChart(temp, rows)
});
getData();

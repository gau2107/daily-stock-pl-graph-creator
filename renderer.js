const mysql = require("mysql2/promise");

const { ipcRenderer } = require("electron");
const Papa = require("papaparse");
const dotenv = require("dotenv");
const path = require("path");

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });
const dbConnectionString = process.env.DB_CONNECTION_STRING;
// Replace the connection details with your own

const form = document.getElementById("form");
form.addEventListener("submit", async (event) => {
  event.preventDefault(); // Prevent the default form submission behavior

  // Get form data
  const date = document.getElementById("datepicker").value;
  const dailyPL = document.getElementById("daily-pl").value;
  const totalPL = document.getElementById("total-pl-input").value;
  const currentValue = document.getElementById("current-value").value;
  const nifty = document.getElementById("nifty-50").value;
  const connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: dbConnectionString,
  });

  // Save form data to MySQL database
  const query = `INSERT INTO daily_pl (date, daily_pl, total_pl, current_value, nifty_50) VALUES ('${date}', ${dailyPL}, ${totalPL}, ${currentValue}, ${nifty})`;
  await connection.query(query);
  ipcRenderer.send("reload-app");

  // Reset form
  document.getElementById("form").reset();
});

let curPageNo = 1;

// Function to display data in the HTML table with pagination
function displayData(parentData, count) {
  const itemsPerPage = 10; // Number of items to display per page
  const dataBody = document.getElementById('dataBody');
  const pagination = document.getElementById('pagination');

  const contributionDiv = document.getElementById('contributionDiv');

  // Calculate the number of pages
  const totalPages = Math.ceil(count.count / itemsPerPage);

  // Function to display a specific page
  function displayPage(pageNumber) {
    curPageNo = pageNumber;
    let data = JSON.parse(JSON.stringify(parentData))

    dataBody.innerHTML = ''; // Clear the table body
    contributionDiv.innerHTML = ''; // Clear the div body

    // Calculate the starting and ending index of the items for the current page
    const startIndex = (pageNumber - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;

    // Loop through the items of the current page and populate the table
    for (let i = 0; i < 10 && i < data.length; i++) {
      const row = document.createElement('tr');

      let niftyPercent = parseFloat((data[i]?.nifty_50 - data[i + 1]?.nifty_50 || 0) * 100 / data[i + 1]?.nifty_50 || 1);
      let dailyPercent = (data[i]?.current_value - data[i + 1]?.current_value || 0) * 100 / data[i + 1]?.current_value || 1;

      // Loop through each key in the object
      for (const key in data[i]) {
        if (key != 'id' && key != 'won') {
          if (key === 'date')
            data[i][key] = new Date(data[i][key]).toDateString()

          const cell = document.createElement('td');
          if (key !== 'nifty_50')
            cell.style.color = data[i].daily_pl > 0 ? 'green' : 'red';

          else {
            cell.style.color = data[i].nifty_50 > data[i + 1]?.nifty_50 ? 'green' : 'red';
            data[i][key] = `₹${data[i][key].toLocaleString("en-IN")} (${((data[i]?.nifty_50 - data[i + 1]?.nifty_50 || 0) * 100 / data[i + 1]?.nifty_50 || 1).toFixed(2)}%)`
          }

          if (key === 'current_value') {
            const tempVal = (data[i]?.current_value - data[i + 1]?.current_value || 0) * 100 / data[i + 1]?.current_value || 1;
            data[i][key] = `₹${data[i][key].toLocaleString("en-IN")} (${(tempVal.toFixed(2))}%) ${dailyPercent > niftyPercent ? ' 👑' : ''}`
            const innerDiv = document.createElement('div');
            innerDiv.className = "contribution-box " + getClass(tempVal);
            contributionDiv.appendChild(innerDiv);
          }


          if (key === 'total_pl' || key === 'daily_pl')
            cell.textContent = `₹${data[i][key].toLocaleString("en-IN")}`;
          else
            cell.textContent = data[i][key];
          row.appendChild(cell);

        }
      }

      dataBody.appendChild(row);
    }
  }

  function getClass(val) {
    if (val > 0 && val < .33) return 'active'
    else if (val > .33 && val < .66) return 'medium'
    else if (val > .66 && val < .99) return 'high'
    else if (val > .99) return 'very-high'
    else if (val > -.33 && val < 0) return 'low'
    else if (val > -.66 && val < -.33) return 'medium-low'
    else if (val > -.99 && val < -.66) return 'very-low'
    else if (val < -.99) return 'very-very-low'


    else return '';
  }
  // Function to create pagination links
  function createPaginationLinks() {
    pagination.innerHTML = ''; // Clear the pagination links

    // Create and append the pagination links
    for (let i = 1; i <= totalPages; i++) {
      const link = document.createElement('li');
      link.classList.add('page-item');
      link.innerHTML = `<a id="page-${i}" class="page-link ${curPageNo == i ? 'active' : ''}" href="#">${i}</a>`;
      link.addEventListener('click', (event) => {
        // Prevent the default behavior of the click event
        event.preventDefault();
        curPageNo = i;
        loadTable((i - 1) * 10);
      });
      pagination.appendChild(link);
    }
  }
  createPaginationLinks();
  displayPage(curPageNo);
}

let connection;
async function start() {
  connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: dbConnectionString,
  });

  loadTable();
  ipcRenderer.send("quarterly-data");
}
async function loadTable(skip = 0) {

  let [ascRows] = await connection.query(`SELECT * FROM daily_pl ORDER BY id DESC LIMIT 10 OFFSET ${skip}`);
  let [count] = await connection.query("SELECT COUNT(id) as count FROM daily_pl");

  // display history table data
  displayData(ascRows, count[0]);
}

function handleActiveClass(element) {
  weeklyBtn.classList.replace("btn-dark", "btn-secondary");
  monthlyBtn.classList.replace("btn-dark", "btn-secondary");
  quarterlyBtn.classList.replace("btn-dark", "btn-secondary");
  yearlyBtn.classList.replace("btn-dark", "btn-secondary");
  allBtn.classList.replace("btn-dark", "btn-secondary");
  filterBtn.classList.replace("btn-dark", "btn-secondary");
  element.classList.replace("btn-secondary", "btn-dark");
}

const weeklyBtn = document.getElementById("weekly");
weeklyBtn.addEventListener("click", (event) => {
  handleActiveClass(weeklyBtn);
  Chart.helpers.each(Chart.instances, (chart) => {
    chart.destroy();
  });
  ipcRenderer.send("weekly-data");
});

const monthlyBtn = document.getElementById("monthly");
monthlyBtn.addEventListener("click", (event) => {
  handleActiveClass(monthlyBtn);
  Chart.helpers.each(Chart.instances, (chart) => {
    chart.destroy();
  });
  ipcRenderer.send("monthly-data");
});

const quarterlyBtn = document.getElementById("quarterly");
quarterlyBtn.addEventListener("click", (event) => {
  handleActiveClass(quarterlyBtn);
  Chart.helpers.each(Chart.instances, (chart) => {
    chart.destroy();
  });
  ipcRenderer.send("quarterly-data");
});

const yearlyBtn = document.getElementById("yearly");
yearlyBtn.addEventListener("click", (event) => {
  handleActiveClass(yearlyBtn);
  Chart.helpers.each(Chart.instances, (chart) => {
    chart.destroy();
  });
  ipcRenderer.send("yearly-data");
});


const allBtn = document.getElementById("all");
allBtn.addEventListener("click", () => {
  handleActiveClass(allBtn);
  Chart.helpers.each(Chart.instances, (chart) => {
    chart.destroy();
  });
  ipcRenderer.send("all-data");
});

const filterBtn = document.getElementById("filter");
filterBtn.addEventListener("click", () => {
  const startDate = document.getElementById("start-date").value;
  const endDate = document.getElementById("end-date").value;
  if (!startDate || !endDate) return;
  handleActiveClass(filterBtn);
  Chart.helpers.each(Chart.instances, (chart) => {
    chart.destroy();
  });
  ipcRenderer.send("filterData", { startDate, endDate });
});

const fileUploadInput = document.getElementById("holdings");
fileUploadInput.addEventListener("change", async (event) => {
  const c = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: dbConnectionString,
  });
  let table;
  const query = `SELECT * from instrument`;
  [table] = await c.query(query);
  let file = event.target.files[0];
  // Parse local CSV file
  Papa.parse(file, {
    download: true,
    complete: function (results) {
      results.data.shift(); //remove first row as it contains labels
      let data = results.data.filter((arr) => arr.length === 8); //so we can filter out blank array
      // replace instrument name to store properly in database
      for (let i = 0; i < data.length; i++) {
        if (data[i][0].startsWith("MCDOW")) data[i][0] = "UNITDSPR";
        if (data[i][0].startsWith("SGBJUN")) data[i][0] = "SGBJUNE31";
        let d = table.find((d) => d.name === data[i][0]);
        data[i][0] = d.id;
      }

      const tableName = "holdings";

      const columns = [
        "instrument_id",
        "qty",
        "avg_cost",
        "ltp",
        "cur_val",
        "p_l",
        "net_chg",
        "day_chg",
      ];

      // Build the query for bulk insert
      const insertQuery = `INSERT INTO ${tableName} (${columns.join(
        ", "
      )}) VALUES ?`;

      c.query(insertQuery, [data], (err, results) => {
        if (err) throw err;
      });
    },
  });
});
start();
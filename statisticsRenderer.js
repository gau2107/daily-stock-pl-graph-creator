const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");
const { getRandomColor, colors } = require("./src/utils/utils");

const envFilePath =
  process.env.NODE_ENV === "development" ? ".env.local" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, envFilePath) });

let connection;
(async function initConnection() {
  connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
})();

async function getData() {
  [rows] = await connection.query(`SELECT h.id, h.net_chg, i.name, DATE_FORMAT(h.date, '%M %Y') AS month_year 
    FROM holdings AS h INNER JOIN instrument AS i ON h.instrument_id = i.id 
    INNER JOIN ( SELECT DISTINCT DATE_FORMAT(date, '%Y-%m') AS month, 
    MAX(date) AS last_working_day FROM holdings 
    WHERE WEEKDAY(date) < 5 -- Exclude weekends (Saturday and Sunday) GROUP BY month ) AS lw 
    ON DATE_FORMAT(h.date, '%Y-%m') = lw.month AND h.date = lw.last_working_day 
    WHERE i.is_active = true;`);
}
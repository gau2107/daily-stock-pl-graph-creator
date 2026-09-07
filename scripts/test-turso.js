const path = require("path");
const dotenv = require("dotenv");
const { createTursoClient } = require("../src/db/turso");

dotenv.config({
  path: path.resolve(
    __dirname,
    process.env.NODE_ENV === "production" ? "../.env.production" : "../.env.local"
  ),
});

async function main() {
  const client = createTursoClient();
  const result = await client.execute("SELECT 1 AS connected");
  console.log(`Turso connection successful: ${result.rows[0].connected === 1}`);
}

main().catch((error) => {
  console.error(`Turso connection failed: ${error.message}`);
  process.exitCode = 1;
});

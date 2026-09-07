const fs = require("fs");
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
  const schema = fs.readFileSync(path.resolve(__dirname, "../schema/turso.sql"), "utf8");
  const statements = schema
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await client.execute(statement);
  }

  console.log(`Turso schema ready (${statements.length} statements applied)`);
}

main().catch((error) => {
  console.error(`Turso schema initialization failed: ${error.message}`);
  process.exitCode = 1;
});

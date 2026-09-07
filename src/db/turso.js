const { createClient } = require("@libsql/client");

function createTursoClient() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error(
      "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured"
    );
  }

  const client = createClient({
    url,
    authToken,
  });

  return {
    execute: (sql, args) => client.execute(sql, args),
    query(sql, args, callback) {
      if (typeof args === "function") {
        callback = args;
        args = undefined;
      }

      if (sql.includes("VALUES ?") && Array.isArray(args) && Array.isArray(args[0])) {
        const rows = args[0];
        const width = rows[0]?.length || 0;
        sql = sql.replace(
          "VALUES ?",
          `VALUES ${rows.map(() => `(${Array(width).fill("?").join(", ")})`).join(", ")}`
        );
        args = rows.flat();
      }

      const request = client.execute(sql, args).then((result) => [result.rows, result]);
      if (callback) {
        request.then(([rows, result]) => callback(null, rows, result)).catch((error) => callback(error));
      }
      return request;
    },
    end: async () => {},
  };
}

module.exports = { createTursoClient };

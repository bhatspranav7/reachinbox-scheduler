import path from "path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log("migrations applied");
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

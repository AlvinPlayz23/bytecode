import { ensureMigrated } from "./index.js";

async function main() {
  console.log("Running database migrations...");
  await ensureMigrated();
  console.log("Database migrated successfully.");
}

main().catch(console.error);

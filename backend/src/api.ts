/** API only (no worker) – pair with `npm run dev:worker` / `start:worker` to scale them separately. */
process.env.RUN_WORKER = "false";
require("./index");

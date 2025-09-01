#!/usr/bin/env node

// Wrapper script to start the development server without tsx IPC issues
import { spawn } from "child_process";

const child = spawn("node", ["--import", "tsx/esm", "server/index.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
  },
});

child.on("exit", (code) => {
  process.exit(code || 0);
});

process.on("SIGINT", () => {
  child.kill("SIGINT");
});

process.on("SIGTERM", () => {
  child.kill("SIGTERM");
});

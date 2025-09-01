#!/usr/bin/env node

// Fixed development server script to avoid tsx IPC issues
import { execSync } from "child_process";

console.log("Starting development server...");

try {
  // Use tsx without IPC by setting NODE_OPTIONS to disable tsx's IPC
  process.env.NODE_ENV = "development";
  process.env.TSX_DISABLE_IPC = "1";

  // Start the server using tsx with disabled IPC
  execSync("npx tsx --no-ipc server/index.ts", {
    stdio: "inherit",
    env: process.env,
  });
} catch (error) {
  console.error("Failed to start server:", error.message);
  process.exit(1);
}

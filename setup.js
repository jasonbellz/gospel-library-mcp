#!/usr/bin/env node
/**
 * setup.js — Adds the gospel-library MCP server to Copilot CLI mcp-config.json.
 *
 * Usage (local dev):
 *   node setup.js
 *
 * Usage (published npm package):
 *   node setup.js --npx
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const configDir = path.join(os.homedir(), ".copilot");
const configPath = path.join(configDir, "mcp-config.json");
const useNpx = process.argv.includes("--npx");
const PACKAGE_NAME = "@jasonbellz/gospel-library-mcp";

if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, "utf8"))
  : {};

if (!config.mcpServers) config.mcpServers = {};

if (useNpx) {
  config.mcpServers["gospel-library"] = {
    command: "npx",
    args: ["-y", PACKAGE_NAME],
  };
} else {
  const serverPath = path.join(__dirname, "dist", "index.js");
  config.mcpServers["gospel-library"] = {
    command: "node",
    args: [serverPath],
  };
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");

const entry = config.mcpServers["gospel-library"];
console.log("✅ gospel-library MCP server registered in ~/.copilot/mcp-config.json");
console.log("   Command:", entry.command, entry.args.join(" "));
console.log("\nRestart Copilot CLI and run /mcp to verify the server is connected.");

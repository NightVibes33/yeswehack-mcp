import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const appId = (process.argv[2] || process.env.ASDK_APP_ID || "").trim();

if (!/^asdk_app_[A-Za-z0-9]+$/.test(appId)) {
  console.error("Usage: npm run package:mobile -- asdk_app_<ChatGPT-generated-id>");
  console.error("The ID must be the raw registered ChatGPT App ID, not plugin_asdk_app_...");
  process.exit(2);
}

const root = resolve("dist/yeswehack-app-mobile");
await rm(root, { recursive: true, force: true });
await mkdir(resolve(root, ".codex-plugin"), { recursive: true });
await mkdir(resolve(root, "skills/yeswehack-workflow"), { recursive: true });

const interfaceConfig = {
  displayName: "YesWeHack",
  shortDescription: "Use YesWeHack in ChatGPT",
  longDescription:
    "Use YesWeHack in ChatGPT through the registered mobile-compatible app connection. Review the connected researcher account, accessible programs, program scope and reward details, reports, report discussion, credentials and public Hacktivity, and perform explicitly authorized account actions exposed by the registered YesWeHack app.",
  developerName: "NightVibes33",
  category: "Developer Tools",
  capabilities: ["Interactive"],
  defaultPrompt: [
    "Show my YesWeHack researcher profile and recent reports.",
    "List the YesWeHack programs I can access and show their scope and rewards.",
    "Help me review one of my YesWeHack reports and its discussion."
  ]
};

const plugin = {
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  name: "yeswehack-app-mobile",
  version: "0.2.0",
  description:
    "Use YesWeHack from ChatGPT through the registered mobile-compatible YesWeHack app connection.",
  author: { name: "NightVibes33" },
  extensions: {
    "com.openai": {
      apps: "./.app.json",
      interface: interfaceConfig
    }
  }
};

const codexPlugin = {
  apps: "./.app.json",
  interface: interfaceConfig,
  name: "yeswehack-app-mobile",
  version: "0.2.0",
  description:
    "Use YesWeHack from ChatGPT through the registered mobile-compatible YesWeHack app connection.",
  author: { name: "NightVibes33" },
  keywords: [],
  skills: "./skills"
};

const app = {
  apps: {
    connector: {
      id: appId,
      required: true
    }
  }
};

const emptyMcp = {
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  mcpServers: {}
};

const skill = `---
name: yeswehack-workflow
description: Use the registered YesWeHack app when the user wants to inspect, summarize, analyze, or act on their authorized YesWeHack researcher account, programs, scope, rewards, reports, report discussion, credentials, aliases, or public Hacktivity.
---

# YesWeHack workflow

Use the registered YesWeHack app connection for YesWeHack account work. Do not fall back to a separately packaged raw MCP server when the registered app is available.

When the registered app requests authentication, use its supported account-link flow. The hosted MCP exchanges the user's normal YesWeHack hunter login and optional 2FA with YesWeHack and stores only the resulting server-side session credential for the OAuth grant. Do not ask the user to paste YesWeHack credentials into normal chat.

Use read-only tools freely when they directly serve the request. Before any security testing or report preparation, inspect the program policy and explicit scope and keep activity within authorized assets and rules.

Treat credential requests, report submission, comments, status changes, attachments, or other account mutations as consequential actions. Invoke a write action only when the user has clearly authorized that specific action and content. Never use a write tool merely to test connectivity.

For duplicate-awareness, Hacktivity can provide public context but is not proof that a finding is unique.
`;

await Promise.all([
  writeFile(resolve(root, ".app.json"), JSON.stringify(app, null, 2) + "\n"),
  writeFile(resolve(root, ".mcp.json"), JSON.stringify({ mcpServers: {} }) + "\n"),
  writeFile(resolve(root, "mcp.json"), JSON.stringify(emptyMcp) + "\n"),
  writeFile(resolve(root, "plugin.json"), JSON.stringify(plugin, null, 2) + "\n"),
  writeFile(resolve(root, ".codex-plugin/plugin.json"), JSON.stringify(codexPlugin, null, 2) + "\n"),
  writeFile(resolve(root, "skills/yeswehack-workflow/SKILL.md"), skill)
]);

console.log("Created mobile App-SDK-only plugin at:");
console.log(root);
console.log("Bound ChatGPT App ID:", appId);
console.log("No remote MCP URL is embedded in the final plugin package.");

import "dotenv/config";
import { Template, defaultBuildLogger } from "e2b";
import { template } from "./template.js";

async function main() {
  console.log("Building Bytecode E2B template (remote, no Docker needed)...\n");

  const buildInfo = await Template.build(template, "bytecode-fabric-1", {
    cpuCount: 2,
    memoryMB: 2048,
    onBuildLogs: defaultBuildLogger(),
  });

  console.log("\n══════════════════════════════════════════════");
  console.log("✓ Template built successfully!");
  console.log(`  Name:        ${buildInfo.name}`);
  console.log(`  Template ID: ${buildInfo.templateId}`);
  console.log(`  Build ID:    ${buildInfo.buildId}`);
  console.log("");
  console.log("  Add this to your .env:");
  console.log(`  BYTECODE_E2B_TEMPLATE_ID=${buildInfo.templateId}`);
  console.log("══════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});

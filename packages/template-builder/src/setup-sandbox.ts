/**
 * Setup a Bytecode sandbox using an existing E2B base template.
 *
 * This script:
 * 1. Creates a sandbox from the base code-interpreter template
 * 2. Installs Java 21 and Git inside it
 * 3. Clones the Fabric example mod 1.21 branch into /workspace
 * 4. Pre-downloads Gradle dependencies
 *
 * Since we can't build custom Docker templates without Docker installed,
 * this script provisions a sandbox at runtime instead.
 *
 * Usage:
 *   set E2B_API_KEY=your-key
 *   pnpm --filter @bytecode/template-builder setup
 */

import { Sandbox } from "e2b";

const TEMPLATE = process.env.BYTECODE_E2B_TEMPLATE_ID || "code-interpreter-v1";

async function run(sbx: Sandbox, cmd: string, label: string) {
  console.log(`→ ${label}...`);
  const result = await sbx.commands.run(cmd, { timeoutMs: 600_000 });
  if (result.exitCode !== 0) {
    console.error(`  ✗ Failed (exit ${result.exitCode})`);
    console.error(result.stderr.slice(0, 500));
    throw new Error(`${label} failed`);
  }
  console.log(`  ✓ Done`);
  return result;
}

async function main() {
  if (!process.env.E2B_API_KEY) {
    console.error("E2B_API_KEY is required. Set it in your environment.");
    process.exit(1);
  }

  console.log(`Creating sandbox from template: ${TEMPLATE}`);
  const sbx = await Sandbox.create(TEMPLATE, { timeoutMs: 600_000 });
  console.log(`Sandbox ID: ${sbx.sandboxId}\n`);

  try {
    // Install Java 21
    await run(
      sbx,
      "apt-get update && apt-get install -y --no-install-recommends openjdk-21-jdk-headless git wget unzip",
      "Installing Java 21 + Git"
    );

    // Verify Java
    const javaCheck = await run(sbx, "java -version 2>&1", "Checking Java");
    console.log(`  Java: ${javaCheck.stdout.split("\n")[0]}`);

    // Clone Fabric example mod 1.21 branch
    await run(
      sbx,
      "rm -rf /workspace/* /workspace/.* 2>/dev/null; git clone --branch 1.21 --depth 1 https://github.com/FabricMC/fabric-example-mod.git /tmp/fabric-mod && cp -r /tmp/fabric-mod/. /workspace/ && rm -rf /tmp/fabric-mod",
      "Cloning Fabric example mod 1.21 branch into /workspace"
    );

    // Make gradlew executable
    await run(sbx, "chmod +x /workspace/gradlew", "Setting gradlew permissions");

    // Pre-download Gradle + dependencies
    await run(
      sbx,
      "cd /workspace && ./gradlew --no-daemon dependencies 2>&1 || true",
      "Pre-downloading Gradle and dependencies (may take a few minutes)"
    );

    // List workspace contents
    const ls = await run(sbx, "ls -la /workspace/", "Listing /workspace");
    console.log(`\n${ls.stdout}`);

    console.log("\n══════════════════════════════════════════════");
    console.log("✓ Sandbox is ready!");
    console.log(`  Sandbox ID: ${sbx.sandboxId}`);
    console.log("");
    console.log("  Add this to your .env:");
    console.log(`  BYTECODE_E2B_TEMPLATE_ID=${TEMPLATE}`);
    console.log("");
    console.log("  NOTE: This sandbox will expire. For production,");
    console.log("  install Docker and run: e2b template build");
    console.log("══════════════════════════════════════════════");
  } catch (err) {
    console.error("\nSetup failed:", err);
    await sbx.kill();
    process.exit(1);
  }
}

main().catch(console.error);

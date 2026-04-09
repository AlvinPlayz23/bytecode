import { getMinecraftAnalysisService } from "../dist/index.js";

const className = process.argv[2] || "net.minecraft.world.level.block.Block";

async function main() {
  const service = getMinecraftAnalysisService();
  const result = await service.getMinecraftSource(className);
  const lines = result.content.split(/\r?\n/);

  console.log(JSON.stringify({
    ok: true,
    version: result.version,
    mapping: result.mapping,
    className: result.className,
    lineCount: lines.length,
    preview: lines.slice(0, 20).join("\n"),
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});

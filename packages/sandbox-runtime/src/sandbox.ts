import { Sandbox } from "e2b";
import { pathUtils } from "./paths";

const DEFAULT_SANDBOX_TIMEOUT_MINUTES = 10;
const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

export interface CompileResult {
  success: boolean;
  stdout: string;
  stderr: string;
  jarPath: string | null;
}

export interface BashCommandResult {
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class SandboxManager {
  private constructor(private sandbox: Sandbox) {}

  get sandboxId(): string {
    return this.sandbox.sandboxId;
  }

  /** Create a new sandbox from the Bytecode E2B template */
  static async create(
    templateId: string,
    sandboxTimeoutMinutes: number = DEFAULT_SANDBOX_TIMEOUT_MINUTES
  ): Promise<SandboxManager> {
    const timeoutMs = sandboxTimeoutMinutes * 60_000;
    const sandbox = await Sandbox.create(templateId, { timeoutMs });
    return new SandboxManager(sandbox);
  }

  /** Reconnect to an existing sandbox */
  static async connect(sandboxId: string): Promise<SandboxManager> {
    const sandbox = await Sandbox.connect(sandboxId);
    return new SandboxManager(sandbox);
  }

  /** List files/dirs at a path inside the sandbox */
  async listFiles(dirPath: string = "/workspace"): Promise<string[]> {
    const safePath = pathUtils.resolve(dirPath);
    const result = await this.sandbox.commands.run(`ls -1 ${safePath}`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to list ${safePath}: ${result.stderr}`);
    }
    return result.stdout.split("\n").filter(Boolean);
  }

  /** Read a file from the sandbox */
  async readFile(filePath: string): Promise<string> {
    const safePath = pathUtils.resolve(filePath);
    const content = await this.sandbox.files.read(safePath);
    return content;
  }

  /** Write a file to the sandbox (creates dirs as needed) */
  async writeFile(filePath: string, content: string): Promise<void> {
    const safePath = pathUtils.resolve(filePath);
    // Ensure parent directory exists
    const dir = safePath.substring(0, safePath.lastIndexOf("/"));
    if (dir && dir !== pathUtils.PROJECT_ROOT) {
      await this.sandbox.commands.run(`mkdir -p ${dir}`);
    }
    await this.sandbox.files.write(safePath, content);
  }

  /** Run a bash command inside the sandbox with /workspace-scoped cwd by default */
  async runBash(
    command: string,
    opts?: { cwd?: string; timeoutMs?: number; envs?: Record<string, string> }
  ): Promise<BashCommandResult> {
    const cwd = pathUtils.resolve(opts?.cwd ?? pathUtils.PROJECT_ROOT);
    const result = await this.sandbox.commands.run(
      `bash -lc ${shellQuote(command)}`,
      {
        cwd,
        envs: opts?.envs,
        timeoutMs: opts?.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
      }
    );

    return {
      command,
      cwd,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  /** Compile the Fabric mod via Gradle */
  async compile(): Promise<CompileResult> {
    // Ensure gradlew is executable
    await this.sandbox.commands.run(
      "chmod +x gradlew || true",
      { cwd: pathUtils.PROJECT_ROOT }
    );

    // Run the build
    const result = await this.sandbox.commands.run(
      "./gradlew build --stacktrace",
      { cwd: pathUtils.PROJECT_ROOT, timeoutMs: 600_000 }
    );

    let jarPath: string | null = null;
    if (result.exitCode === 0) {
      // Find the output jar, excluding sources/javadoc jars
      const findJar = await this.sandbox.commands.run(
        `find ${pathUtils.PROJECT_ROOT}/build/libs -name "*.jar" ! -name "*-sources.jar" ! -name "*-javadoc.jar" | head -1`,
        { cwd: pathUtils.PROJECT_ROOT }
      );
      jarPath = findJar.stdout.trim() || null;
    }

    return {
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      jarPath,
    };
  }

  /** Download a file (jar) from the sandbox as a Buffer */
  async downloadFile(filePath: string): Promise<string> {
    const safePath = pathUtils.resolve(filePath);
    const content = await this.sandbox.files.read(safePath);
    return content;
  }

  /** Keep the sandbox alive */
  async keepAlive(timeoutMs: number = 600_000): Promise<void> {
    await this.sandbox.setTimeout(timeoutMs);
  }

  /** Kill the sandbox */
  async kill(): Promise<void> {
    await this.sandbox.kill();
  }
}

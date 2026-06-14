import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";

export class TelebitTunnel {
  private process: ChildProcess | null = null;
  private tunnelUrl: string | null = null;
  private outputBuffer: string = "";
  private onUrlReady: ((url: string) => void) | null = null;
  private onError: ((err: Error) => void) | null = null;

  static async start(port: number): Promise<TelebitTunnel> {
    const tunnel = new TelebitTunnel();
    await tunnel.init(port);
    return tunnel;
  }

  private async init(port: number): Promise<void> {
    const isInitialized = await this.checkInitialized();
    if (!isInitialized) {
      await this.autoInit();
    }
    await this.startTunnel(port);
  }

  private runCommand(cmd: string, args: string[], timeoutMs: number = 15000): Promise<{ code: number; output: string }> {
    return new Promise((resolve) => {
      const proc = spawn(cmd, args, {
        shell: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, npm_config_yes: "true" },
      });

      let output = "";
      proc.stdout?.on("data", (d: Buffer) => (output += d.toString()));
      proc.stderr?.on("data", (d: Buffer) => (output += d.toString()));

      const timer = setTimeout(() => {
        proc.kill();
        resolve({ code: -1, output: output + "\n[timeout]" });
      }, timeoutMs);

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, output });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({ code: -1, output: err.message });
      });
    });
  }

  private async checkInitialized(): Promise<boolean> {
    const { code, output } = await this.runCommand("npx", ["--yes", "telebit", "status"]);
    return code === 0 && !output.includes("not found") && !output.includes("not initialized");
  }

  private async autoInit(): Promise<void> {
    const email = await vscode.window.showInputBox({
      prompt: "Telebit needs your email for a one-time setup (for certificate recovery & security alerts)",
      placeHolder: "you@example.com",
      validateInput: (v) => (v.includes("@") ? null : "Valid email required"),
    });

    if (!email) {
      throw new Error("Telebit setup cancelled — email is required for tunneling");
    }

    const agreeTos = await vscode.window.showQuickPick(["Yes, I agree"], {
      placeHolder: "Do you agree to the Telebit, Greenlock, and Let's Encrypt Terms of Service?",
    });

    if (!agreeTos) {
      throw new Error("Telebit setup cancelled — TOS agreement required");
    }

    const { code, output } = await this.runCommand("npx", [
      "--yes", "telebit", "init",
      "--email", email,
      "--agree-tos",
      "--community-member",
      "--telemetry",
    ]);

    if (code !== 0) {
      throw new Error(`Telebit init failed: ${output.slice(0, 200)}`);
    }

    vscode.window.showInformationMessage("Telebit: Setup complete!");
  }

  private async startTunnel(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.onUrlReady = (url: string) => {
        this.tunnelUrl = url;
        resolve();
      };
      this.onError = (err: Error) => reject(err);

      this.process = spawn("npx", ["--yes", "telebit", "http", String(port)], {
        shell: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, npm_config_yes: "true" },
      });

      this.process.stdout?.on("data", (data: Buffer) => {
        this.outputBuffer += data.toString();
        this.parseOutput();
      });

      this.process.stderr?.on("data", (data: Buffer) => {
        this.outputBuffer += data.toString();
        this.parseOutput();
      });

      this.process.on("error", (err) => {
        if (this.onError) this.onError(err);
      });

      this.process.on("close", (code) => {
        if (code !== null && code !== 0 && !this.tunnelUrl) {
          if (this.onError) {
            this.onError(new Error(`Telebit exited with code ${code}`));
          }
        }
        this.process = null;
      });

      setTimeout(() => {
        if (!this.tunnelUrl) {
          this.stop();
          reject(new Error("Telebit tunnel timed out after 30s"));
        }
      }, 30000);
    });
  }

  private parseOutput(): void {
    const match = this.outputBuffer.match(
      /Forwarding\s+(\S+\.telebit\.cloud)\s*=>\s*localhost:\d+/
    );
    if (match && this.onUrlReady) {
      const cb = this.onUrlReady;
      this.onUrlReady = null;
      cb(`https://${match[1]}`);
    }
  }

  getUrl(): string | null {
    return this.tunnelUrl;
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.tunnelUrl = null;
    this.outputBuffer = "";
  }
}

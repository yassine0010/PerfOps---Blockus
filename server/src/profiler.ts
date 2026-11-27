// ─── On-Demand V8 CPU Profiler for Load Testing ─────────────────────────────
// Uses Node.js native 'node:inspector' to capture exact CPU call stacks
// exclusively during load test execution without polluting cold startup or idle times.

import inspector from 'node:inspector';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

class CpuProfiler {
  private session: inspector.Session | null = null;
  private isProfiling: boolean = false;
  private isStarting: boolean = false;
  private startPromise: Promise<{ success: boolean; message: string }> | null = null;
  private startedAt: number = 0;

  public start(): Promise<{ success: boolean; message: string }> {
    if (this.isProfiling) {
      return Promise.resolve({
        success: true,
        message: 'Profiler is already active',
      });
    }
    if (this.isStarting && this.startPromise) {
      return this.startPromise;
    }

    this.isStarting = true;
    this.startPromise = new Promise<{ success: boolean; message: string }>((resolve, reject) => {
      const session = new inspector.Session();
      this.session = session;
      session.connect();

      session.post('Profiler.enable', (enableErr) => {
        if (enableErr) {
          this.cleanup();
          return reject(enableErr);
        }

        session.post('Profiler.start', (startErr) => {
          if (startErr) {
            this.cleanup();
            return reject(startErr);
          }

          this.isStarting = false;
          this.isProfiling = true;
          this.startedAt = Date.now();
          console.log('🔥 [Profiler] V8 CPU Profiler started for load testing');
          resolve({
            success: true,
            message: 'V8 CPU Profiler started',
          });
        });
      });
    }).finally(() => {
      this.isStarting = false;
      this.startPromise = null;
    });

    return this.startPromise;
  }

  public async stop(filename: string = 'load-test.cpuprofile'): Promise<{
    success: boolean;
    durationMs: number;
    filepath: string;
    message: string;
  }> {
    if (!this.isProfiling || !this.session) {
      return {
        success: false,
        durationMs: 0,
        filepath: '',
        message: 'Profiler was not active',
      };
    }

    const rawName = path.basename(String(filename || 'load-test.cpuprofile'));
    const baseName = rawName.endsWith('.cpuprofile') ? rawName : `${rawName}.cpuprofile`;
    if (!/^[a-zA-Z0-9._-]{1,64}\.cpuprofile$/.test(baseName)) {
      throw new Error('Invalid profile filename');
    }

    const durationMs = Date.now() - this.startedAt;
    const session = this.session;

    const result = await new Promise<inspector.Profiler.StopReturnType>((resolve, reject) => {
      session.post('Profiler.stop', (err, res) => {
        if (err || !res?.profile) {
          this.cleanup();
          return reject(err || new Error('No profile data returned'));
        }
        resolve(res);
      });
    });

    const profileJson = JSON.stringify(result.profile);

    // 1. Write strictly inside repo-root profiles/ directory using sanitized basename
    const outDir = path.join(REPO_ROOT, 'profiles');
    await fs.promises.mkdir(outDir, { recursive: true });
    const profileFilepath = path.join(outDir, baseName);
    await fs.promises.writeFile(profileFilepath, profileJson);

    // 2. Preserve default flamegraph convenience file at repo root for `npm run flamegraph`
    if (baseName === 'load-test.cpuprofile') {
      const rootFilepath = path.join(REPO_ROOT, baseName);
      await fs.promises.writeFile(rootFilepath, profileJson);
    }

    this.cleanup();
    console.log(`✅ [Profiler] Profile captured (${durationMs}ms). Saved to: ${profileFilepath}`);
    return {
      success: true,
      durationMs,
      filepath: profileFilepath,
      message: `CPU profile captured and written to ${profileFilepath}`,
    };
  }

  public getStatus(): { isProfiling: boolean; startedAt: number; durationMs: number } {
    return {
      isProfiling: this.isProfiling,
      startedAt: this.startedAt,
      durationMs: this.isProfiling ? Date.now() - this.startedAt : 0,
    };
  }

  private cleanup() {
    this.isStarting = false;
    this.isProfiling = false;
    this.startedAt = 0;
    if (this.session) {
      try {
        this.session.post('Profiler.disable');
        this.session.disconnect();
      } catch {}
      this.session = null;
    }
  }
}

export const cpuProfiler = new CpuProfiler();

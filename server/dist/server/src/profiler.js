// ─── On-Demand V8 CPU Profiler for Load Testing ─────────────────────────────
// Uses Node.js native 'node:inspector' to capture exact CPU call stacks
// exclusively during load test execution without polluting cold startup or idle times.
import inspector from 'node:inspector';
import fs from 'node:fs';
import path from 'node:path';
class CpuProfiler {
    session = null;
    isProfiling = false;
    startedAt = 0;
    start() {
        return new Promise((resolve, reject) => {
            if (this.isProfiling) {
                return resolve({
                    success: true,
                    message: 'Profiler is already active',
                });
            }
            this.session = new inspector.Session();
            this.session.connect();
            this.session.post('Profiler.enable', (enableErr) => {
                if (enableErr) {
                    this.cleanup();
                    return reject(enableErr);
                }
                this.session?.post('Profiler.start', (startErr) => {
                    if (startErr) {
                        this.cleanup();
                        return reject(startErr);
                    }
                    this.isProfiling = true;
                    this.startedAt = Date.now();
                    console.log('🔥 [Profiler] V8 CPU Profiler started for load testing');
                    resolve({
                        success: true,
                        message: 'V8 CPU Profiler started',
                    });
                });
            });
        });
    }
    stop(filename = 'load-test.cpuprofile') {
        return new Promise((resolve, reject) => {
            if (!this.isProfiling || !this.session) {
                return resolve({
                    success: false,
                    durationMs: 0,
                    filepath: '',
                    message: 'Profiler was not active',
                });
            }
            const durationMs = Date.now() - this.startedAt;
            this.session.post('Profiler.stop', (err, result) => {
                if (err || !result?.profile) {
                    this.cleanup();
                    return reject(err || new Error('No profile data returned'));
                }
                const profileJson = JSON.stringify(result.profile);
                // 1. Write to profiles/ directory
                const outDir = path.resolve(process.cwd(), 'profiles');
                if (!fs.existsSync(outDir)) {
                    fs.mkdirSync(outDir, { recursive: true });
                }
                const profileFilepath = path.join(outDir, filename);
                fs.writeFileSync(profileFilepath, profileJson);
                // 2. Also write directly to working directory root for quick access
                const rootFilepath = path.resolve(process.cwd(), filename);
                fs.writeFileSync(rootFilepath, profileJson);
                this.cleanup();
                console.log(`✅ [Profiler] Profile captured (${durationMs}ms). Saved to: ${rootFilepath}`);
                resolve({
                    success: true,
                    durationMs,
                    filepath: rootFilepath,
                    message: `CPU profile captured and written to ${rootFilepath}`,
                });
            });
        });
    }
    getStatus() {
        return {
            isProfiling: this.isProfiling,
            startedAt: this.startedAt,
            durationMs: this.isProfiling ? Date.now() - this.startedAt : 0,
        };
    }
    cleanup() {
        this.isProfiling = false;
        this.startedAt = 0;
        if (this.session) {
            try {
                this.session.post('Profiler.disable');
                this.session.disconnect();
            }
            catch { }
            this.session = null;
        }
    }
}
export const cpuProfiler = new CpuProfiler();

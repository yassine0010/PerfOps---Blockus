// ─── SLI Metrics (In-Memory Monotonic Counters & Cumulative Histograms) ─────
// All SLI metrics are stored in memory and exposed via GET /metrics (Prometheus text format).
// No database persistence — Prometheus handles resets natively.
// Uses O(1) cumulative bucket counters (no raw sample arrays or memory leakage).
class CumulativeHistogram {
    name;
    help;
    buckets;
    bucketCounts;
    count = 0;
    sum = 0;
    constructor(name, help, buckets) {
        this.name = name;
        this.help = help;
        this.buckets = [...buckets].sort((a, b) => a - b);
        this.bucketCounts = new Array(this.buckets.length).fill(0);
    }
    record(value) {
        if (!Number.isFinite(value) || value < 0)
            return;
        this.count++;
        this.sum += value;
        for (let i = 0; i < this.buckets.length; i++) {
            if (value <= this.buckets[i]) {
                this.bucketCounts[i]++;
            }
        }
    }
    toPrometheusText() {
        const lines = [
            `# HELP ${this.name} ${this.help}`,
            `# TYPE ${this.name} histogram`,
        ];
        for (let i = 0; i < this.buckets.length; i++) {
            lines.push(`${this.name}_bucket{le="${this.buckets[i]}"} ${this.bucketCounts[i]}`);
        }
        lines.push(`${this.name}_bucket{le="+Inf"} ${this.count}`);
        lines.push(`${this.name}_sum ${this.sum}`);
        lines.push(`${this.name}_count ${this.count}`);
        return lines.join('\n');
    }
}
// ─── Histograms (O(1) memory, cumulative bucket counters) ────
// SLI-2: Join Speed (ms)
const joinHistogram = new CumulativeHistogram('blokus_join_duration_ms', 'Time from Host/Join click to room appearing (ms).', [100, 250, 500, 1000, 2000, 5000, 10000, 15000]);
// SLI-3: Move Speed (ms) — client-to-server round-trip time
const moveHistogram = new CumulativeHistogram('blokus_move_duration_ms', 'Time from sending move until confirmation comes back (ms).', [10, 25, 50, 100, 150, 200, 250, 300, 500, 1000]);
// SLI-6: Pages Speed (ms) — client-observed duration for login, register, profile, leaderboard actions
const pageHistogram = new CumulativeHistogram('blokus_page_response_ms', 'Client-observed duration for login, register, profile, leaderboard actions (ms).', [25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 15000]);
// ─── Counters (Monotonically increasing) ─────────────────────
// SLI-4: Move Accepted
let movesAccepted = 0;
let movesRejected = 0;
// SLI-5: Connection Stability
let unexpectedDisconnects = 0;
let playersEnteredMatch = 0;
// ─── Public API ──────────────────────────────────────────────
export const sliMetrics = {
    // SLI-2: Join Speed
    recordJoinDuration(durationMs) {
        joinHistogram.record(durationMs);
    },
    // SLI-3: Move Speed
    recordMoveDuration(durationMs) {
        moveHistogram.record(durationMs);
    },
    // SLI-4: Move Accepted
    recordMoveAccepted() { movesAccepted++; },
    recordMoveRejected() { movesRejected++; },
    // SLI-5: Connection Stability
    recordPlayerEnteredMatch() { playersEnteredMatch++; },
    recordUnexpectedDisconnect() { unexpectedDisconnects++; },
    // SLI-6: Pages Speed
    recordPageDuration(durationMs) {
        pageHistogram.record(durationMs);
    },
    // ─── Prometheus text output for all SLIs (2–6) ─────────────
    toPrometheusText() {
        const sections = [];
        // SLI-2: Join Speed (histogram)
        sections.push(joinHistogram.toPrometheusText());
        // SLI-3: Move Speed (histogram)
        sections.push(moveHistogram.toPrometheusText());
        // SLI-4: Move Accepted (counters)
        sections.push([
            '# HELP blokus_moves_accepted_total Moves accepted by the server.',
            '# TYPE blokus_moves_accepted_total counter',
            `blokus_moves_accepted_total ${movesAccepted}`,
            '# HELP blokus_moves_rejected_total Moves rejected by the server.',
            '# TYPE blokus_moves_rejected_total counter',
            `blokus_moves_rejected_total ${movesRejected}`,
        ].join('\n'));
        // SLI-5: Connection Stability (counters)
        sections.push([
            '# HELP blokus_players_entered_match_total Players who entered a running match.',
            '# TYPE blokus_players_entered_match_total counter',
            `blokus_players_entered_match_total ${playersEnteredMatch}`,
            '# HELP blokus_unexpected_disconnects_total Unexpected disconnects during matches.',
            '# TYPE blokus_unexpected_disconnects_total counter',
            `blokus_unexpected_disconnects_total ${unexpectedDisconnects}`,
        ].join('\n'));
        // SLI-6: Pages Speed (histogram)
        sections.push(pageHistogram.toPrometheusText());
        return sections.join('\n');
    }
};

// In-process metrics for challenge review observability
// These counters reset on bot restart — they are for operational monitoring only

export const metrics = {
    aiCalls: 0,
    aiFails: 0,
    totalLatencyMs: 0,
    totalConfidence: 0,
    reviewsCompleted: 0,
    queueDepth: 0,

    get avgLatency(): number {
        return this.aiCalls ? Math.round(this.totalLatencyMs / this.aiCalls) : 0;
    },
    get failureRate(): number {
        return this.aiCalls ? +(this.aiFails / this.aiCalls).toFixed(3) : 0;
    },
    get avgConfidence(): number {
        return this.reviewsCompleted ? +(this.totalConfidence / this.reviewsCompleted).toFixed(3) : 0;
    },

    recordAICall(latencyMs: number, failed: boolean): void {
        this.aiCalls++;
        this.totalLatencyMs += latencyMs;
        if (failed) this.aiFails++;
    },

    recordReview(confidence: number): void {
        this.reviewsCompleted++;
        this.totalConfidence += confidence;
    },

    reset(): void {
        this.aiCalls = 0;
        this.aiFails = 0;
        this.totalLatencyMs = 0;
        this.totalConfidence = 0;
        this.reviewsCompleted = 0;
        this.queueDepth = 0;
    },
};

// Log metrics summary every 5 minutes (only if reviews happened)
let _metricsInterval: ReturnType<typeof setInterval> | null = null;

export function startMetricsLogging(): void {
    if (_metricsInterval) return;
    _metricsInterval = setInterval(() => {
        if (metrics.reviewsCompleted === 0 && metrics.aiCalls === 0) return;
        console.log(
            `[Challenge Metrics] Reviews: ${metrics.reviewsCompleted} | AI Calls: ${metrics.aiCalls} | ` +
            `Avg Latency: ${metrics.avgLatency}ms | Failure Rate: ${(metrics.failureRate * 100).toFixed(1)}% | ` +
            `Avg Confidence: ${metrics.avgConfidence} | Queue Depth: ${metrics.queueDepth}`
        );
    }, 5 * 60 * 1000);
}

export function stopMetricsLogging(): void {
    if (_metricsInterval) {
        clearInterval(_metricsInterval);
        _metricsInterval = null;
    }
}

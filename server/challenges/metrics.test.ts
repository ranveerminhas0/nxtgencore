import { describe, it, expect } from 'vitest';
import { metrics, startMetricsLogging, stopMetricsLogging } from './metrics';

describe('Challenge Metrics', () => {
    it('should initialize with correct default values', () => {
        metrics.reset();
        expect(metrics.aiCalls).toBe(0);
        expect(metrics.reviewsCompleted).toBe(0);
        expect(metrics.failureRate).toBe(0);
        expect(metrics.avgLatency).toBe(0);
        expect(metrics.avgConfidence).toBe(0);
    });

    it('should record ai calls and calculate averages', () => {
        metrics.reset();
        metrics.recordAICall(100, false);
        metrics.recordAICall(200, true);

        expect(metrics.aiCalls).toBe(2);
        expect(metrics.aiFails).toBe(1);
        expect(metrics.totalLatencyMs).toBe(300);
        expect(metrics.avgLatency).toBe(150);
        expect(metrics.failureRate).toBe(0.5);
    });

    it('should record reviews and calculate confidence', () => {
        metrics.reset();
        metrics.recordReview(0.9);
        metrics.recordReview(0.8);

        expect(metrics.reviewsCompleted).toBe(2);
        expect(metrics.avgConfidence).toBe(0.85);
    });
});

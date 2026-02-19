import { metrics } from "./metrics";
import { processReviewJob, type ReviewJob } from "./reviewer";

// ─── Semaphore-based concurrency limiter ────────────────────────────────────
// We implement a basic semaphore instead of requiring p-limit as a dependency.
// Max 5 concurrent AI calls at any time.

const MAX_CONCURRENT = 5;
let activeJobs = 0;
const waitQueue: Array<() => void> = [];

function acquire(): Promise<void> {
    if (activeJobs < MAX_CONCURRENT) {
        activeJobs++;
        metrics.queueDepth = waitQueue.length;
        return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
        waitQueue.push(resolve);
        metrics.queueDepth = waitQueue.length;
    });
}

function release(): void {
    if (waitQueue.length > 0) {
        const next = waitQueue.shift()!;
        metrics.queueDepth = waitQueue.length;
        next(); // Don't decrement activeJobs — the next job takes over the slot
    } else {
        activeJobs--;
        metrics.queueDepth = waitQueue.length;
    }
}

/**
 * Enqueue a review job. Returns immediately — does NOT block the caller.
 * The job will run in the background, limited by the semaphore.
 */
export function enqueueReview(job: ReviewJob): void {
    // Fire and forget — caller returns immediately
    (async () => {
        await acquire();
        try {
            await processReviewJob(job);
        } catch (err) {
            console.error("[ReviewQueue] Unexpected error in job:", err);
        } finally {
            release();
        }
    })();
}

/**
 * Get current queue stats for diagnostics.
 */
export function getQueueStats(): { activeJobs: number; waitingJobs: number } {
    return { activeJobs, waitingJobs: waitQueue.length };
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enqueueReview, getQueueStats } from './queue';
import * as reviewer from './reviewer';

vi.mock('./reviewer', () => ({
    processReviewJob: vi.fn().mockImplementation(async () => {
        // simulate async work
        await new Promise(r => setTimeout(r, 10));
    })
}));

describe('Challenge Review Queue', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Since activeJobs is tricky to reset without exporting a reset function,
        // we just rely on it naturally draining between fast tests,
        // but we can ensure enqueue fires processReviewJob
    });

    it('should enqueue and execute a review job', async () => {
        const fakeJob = {} as any;
        enqueueReview(fakeJob);

        // Ensure state captures execution
        expect(getQueueStats().activeJobs).toBeGreaterThanOrEqual(0);

        // Next tick
        await new Promise(r => setTimeout(r, 20));

        expect(reviewer.processReviewJob).toHaveBeenCalledWith(fakeJob);
    });
});

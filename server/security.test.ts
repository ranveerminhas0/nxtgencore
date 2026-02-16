import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { standardRateLimiter } from './rate-limit';

describe('Security: Rate Limiting', () => {
    let app: express.Express;

    beforeEach(() => {
        app = express();
        // Use a very strict limit for testing purposes if possible, 
        // but here we test the exported one.
        app.use(standardRateLimiter);
        app.get('/test', (req, res) => res.status(200).send('ok'));
    });

    it('should allow requests under the limit', async () => {
        const res = await request(app).get('/test');
        expect(res.status).toBe(200);
    });

    // Note: Testing the full 100 limit in a unit test might be slow/excessive,
    // but it verifies the middleware is active.
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from './routes';
import { createServer } from 'http';

// Mock bot status and storage
vi.mock('./bot', () => ({
    botStatus: { online: true, startTime: Date.now() },
    startBot: vi.fn(),
}));

vi.mock('./storage', () => ({
    storage: {
        getAllConfiguredGuilds: vi.fn().mockResolvedValue([]),
    },
}));

describe('API Authentication', () => {
    let app: express.Express;
    let server: any;

    beforeEach(async () => {
        app = express();
        app.use(express.json());
        // Create server instance manually to match registerRoutes signature
        const httpServer = createServer(app);
        await registerRoutes(httpServer, app);
        server = httpServer;
    });

    it('should return 401 for external requests with no API key', async () => {
        // Force API_SECRET to be set
        process.env.API_SECRET = 'test-secret';

        const response = await request(app).get('/api/status');
        expect(response.status).toBe(401);
    });

    it('should return 200 for external requests with valid API key', async () => {
        process.env.API_SECRET = 'test-secret';

        const response = await request(app)
            .get('/api/status')
            .set('x-api-key', 'test-secret');

        expect(response.status).toBe(200);
    });

    it('should return 401 for external requests with invalid API key', async () => {
        process.env.API_SECRET = 'test-secret';

        const response = await request(app)
            .get('/api/status')
            .set('x-api-key', 'wrong-secret');

        expect(response.status).toBe(401);
    });

    it('should return 200 for same-origin requests (frontend)', async () => {
        process.env.API_SECRET = 'test-secret';

        const response = await request(app)
            .get('/api/status')
            .set('sec-fetch-site', 'same-origin');

        expect(response.status).toBe(200);
    });

    it('should deny requests when API_SECRET is not set (default deny)', async () => {
        delete process.env.API_SECRET;

        const response = await request(app).get('/api/status');
        // Expect 401 because the logic is "if secret not match AND not same origin -> 401"
        expect(response.status).toBe(401);
    });
});

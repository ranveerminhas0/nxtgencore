/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBotStatus, useTrackedMembers, useDashboard } from './use-dashboard';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Setup mocked fetch
global.fetch = vi.fn();

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } }
    });
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
};

describe('Dashboard Hooks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('useDashboard should fetch dashboard data successfully', async () => {
        const mockData = { metrics: { totalCommands: 10 } };
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => mockData
        });

        const { result } = renderHook(() => useDashboard(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual(mockData);
        expect(global.fetch).toHaveBeenCalledWith('/api/dashboard');
    });

    it('useDashboard should handle fetch errors', async () => {
        (global.fetch as any).mockResolvedValueOnce({ ok: false });

        const { result } = renderHook(() => useDashboard(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error?.message).toBe('Failed to fetch dashboard data');
    });
});

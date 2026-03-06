/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast, toast } from './use-toast';

describe('use-toast hook', () => {
    beforeEach(() => {
        // We can't entirely mock internal state without exposing but we can test behaviors
        vi.useFakeTimers();
    });

    it('should add a toast and update state', () => {
        const { result } = renderHook(() => useToast());

        expect(result.current.toasts).toHaveLength(0);

        act(() => {
            toast({ title: 'Test', description: 'Description' });
        });

        expect(result.current.toasts).toHaveLength(1);
        expect(result.current.toasts[0].title).toBe('Test');
        expect(result.current.toasts[0].open).toBe(true);
    });

    it('should dismiss a toast', () => {
        const { result } = renderHook(() => useToast());

        let toastId: string;
        act(() => {
            const { id } = toast({ title: 'Test Dismiss' });
            toastId = id;
        });

        expect(result.current.toasts).toHaveLength(1);

        act(() => {
            result.current.dismiss(toastId);
        });

        // Dismiss sets open to false before removal timeout
        expect(result.current.toasts[0].open).toBe(false);
    });
});

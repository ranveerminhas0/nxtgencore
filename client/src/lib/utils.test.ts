import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('Utility Functions - cn', () => {
    it('should merge tailwind classes correctly', () => {
        // Basic merge
        expect(cn('bg-red-500', 'text-white')).toBe('bg-red-500 text-white');

        // Override conflict
        expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');

        // Conditional classes
        expect(cn('p-4', true && 'm-4', false && 'rounded')).toBe('p-4 m-4');

        // Arrays and objects
        expect(cn(['flex', 'items-center'], { 'justify-center': true, 'hidden': false })).toBe('flex items-center justify-center');
    });
});

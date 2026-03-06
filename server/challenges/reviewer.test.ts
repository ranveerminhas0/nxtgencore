import { describe, it, expect } from 'vitest';
import { extractCode } from './reviewer';

describe('Challenge Reviewer Utilities', () => {
    it('extractCode should parse triple backticks with language', () => {
        const content = 'Here is my answer:\n```javascript\nconsole.log("hello");\n```\nThanks!';
        const result = extractCode(content);
        expect(result).not.toBeNull();
        expect(result?.language).toBe('JavaScript');
        expect(result?.code).toBe('console.log("hello");');
    });

    it('extractCode should parse triple backticks without language', () => {
        const content = '```\nprint("hello")\n```';
        const result = extractCode(content);
        expect(result?.language).toBe('Unknown');
        expect(result?.code).toBe('print("hello")');
    });

    it('extractCode should parse long inline code', () => {
        const content = 'try this `function x() { return 1; }`';
        const result = extractCode(content);
        expect(result?.language).toBe('Unknown');
        expect(result?.code).toBe('function x() { return 1; }');
    });

    it('extractCode should return null if no code found', () => {
        const content = 'I dont know how to code sorry';
        const result = extractCode(content);
        expect(result).toBeNull();
    });
});

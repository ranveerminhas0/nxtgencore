import { describe, it, expect } from 'vitest';
import { normalise, isCopied } from './plagiarism';

describe('Plagiarism Detection', () => {
    it('normalise should remove whitespace, comments, and lowercase', () => {
        const input = `
            // this is a comment
            function hello() {
                /* multiline
                   comment */
                const x = "WORLD";
                return x;
            }
        `;
        const expected = 'functionhello(){constx="world";returnx;}';
        expect(normalise(input)).toBe(expected);
    });

    it('isCopied should return true for structurally identical code with superficial changes', () => {
        const existing = [
            `const x = 5; // old code`,
            `function test() { return true; }`
        ];

        const newCode = `
            const x=5; 
            /* changed comment */
        `;

        expect(isCopied(newCode, existing)).toBe(true);
    });

    it('isCopied should return false for different code', () => {
        const existing = [`const x = 5;`];
        const newCode = `const y = 5;`;

        expect(isCopied(newCode, existing)).toBe(false);
    });

    it('isCopied should ignore completely empty normalized outputs', () => {
        const existing = [`const x = 5;`];
        const newCode = `// just comments`;

        expect(isCopied(newCode, existing)).toBe(false);
    });
});

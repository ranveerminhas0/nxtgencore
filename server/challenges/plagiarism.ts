// Plagiarism / Copy Detection
// Lightweight normalisation-based check.  Strips whitespace, comments, and
// lowercases the code so superficial edits (spacing, casing, comments) are
// ignored.  Returns true if the new code matches ANY existing snippet.

/**
 * Normalise a code string for comparison.
 *  1. Remove single-line comments  (// …)
 *  2. Remove multi-line comments   (/* … *​/)
 *  3. Remove all whitespace
 *  4. Lowercase
 */
export function normalise(code: string): string {
    return code
        .replace(/\/\/.*$/gm, "")       // strip single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, "") // strip multi-line comments
        .replace(/\s+/g, "")            // strip all whitespace
        .toLowerCase();
}

/**
 * Check whether `newCode` is a copy of any entry in `existingCodes`.
 * Both sides are normalised before comparison.
 *
 * Returns `true` if the normalised new code exactly matches any existing one.
 */
export function isCopied(newCode: string, existingCodes: string[]): boolean {
    if (existingCodes.length === 0) return false;

    const normNew = normalise(newCode);
    if (normNew.length === 0) return false; // don't flag empty strings

    return existingCodes.some((existing) => normalise(existing) === normNew);
}

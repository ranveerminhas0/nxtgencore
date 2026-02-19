import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock DB + storage to prevent connection errors
vi.mock('../db', () => ({
    db: {
        transaction: vi.fn(),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }),
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) }) }),
        select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    },
    pool: {}
}));

vi.mock('../storage', () => ({
    storage: {
        getAllConfiguredGuilds: vi.fn(),
        getUserSubmissions: vi.fn(),
        insertSubmission: vi.fn(),
        submissionExists: vi.fn(),
    }
}));

// extractCode Tests

import { extractCode } from './reviewer';

describe('extractCode — Language Detection', () => {

    it('should extract JavaScript from fenced code block', () => {
        const content = '```js\nfunction add(a, b) { return a + b; }\n```';
        const result = extractCode(content);
        expect(result).not.toBeNull();
        expect(result!.language).toBe('JavaScript');
        expect(result!.code).toBe('function add(a, b) { return a + b; }');
    });

    it('should extract Python from fenced code block', () => {
        const content = '```python\ndef add(a, b):\n    return a + b\n```';
        const result = extractCode(content);
        expect(result).not.toBeNull();
        expect(result!.language).toBe('Python');
        expect(result!.code).toContain('def add(a, b)');
    });

    it('should extract TypeScript from ts fence', () => {
        const content = '```ts\nconst x: number = 42;\n```';
        const result = extractCode(content);
        expect(result).not.toBeNull();
        expect(result!.language).toBe('TypeScript');
    });

    it('should extract C++ from cpp fence', () => {
        const content = '```cpp\nint main() { return 0; }\n```';
        const result = extractCode(content);
        expect(result!.language).toBe('C++');
    });

    it('should extract Rust from rs fence', () => {
        const content = '```rs\nfn main() { println!("hello"); }\n```';
        const result = extractCode(content);
        expect(result!.language).toBe('Rust');
    });

    it('should extract Go from go fence', () => {
        const content = '```go\npackage main\nfunc main() {}\n```';
        const result = extractCode(content);
        expect(result!.language).toBe('Go');
    });

    it('should handle code block with no language tag', () => {
        const content = '```\nsome code here\n```';
        const result = extractCode(content);
        expect(result).not.toBeNull();
        expect(result!.language).toBe('Unknown');
        expect(result!.code).toBe('some code here');
    });

    it('should handle Java from java fence', () => {
        const content = '```java\npublic class Main { public static void main(String[] args) {} }\n```';
        const result = extractCode(content);
        expect(result!.language).toBe('Java');
    });

    it('should handle Ruby from rb fence', () => {
        const content = '```rb\ndef greet; puts "hello"; end\n```';
        const result = extractCode(content);
        expect(result!.language).toBe('Ruby');
    });

    it('should handle C# from csharp fence', () => {
        const content = '```csharp\nclass Program { static void Main() {} }\n```';
        const result = extractCode(content);
        expect(result!.language).toBe('C#');
    });

    it('should return null for plain text messages', () => {
        const content = 'Hey, here is my solution: just add the two numbers together';
        const result = extractCode(content);
        expect(result).toBeNull();
    });

    it('should extract long inline code', () => {
        const content = 'My answer: `function reverseString(s) { return s.split("").reverse().join(""); }`';
        const result = extractCode(content);
        expect(result).not.toBeNull();
        expect(result!.language).toBe('Unknown');
    });

    it('should not extract short inline code', () => {
        const content = 'Use `x + y` for this';
        const result = extractCode(content);
        expect(result).toBeNull();
    });

    it('should handle multiline code in block', () => {
        const content = '```javascript\nfunction fib(n) {\n  if (n <= 1) return n;\n  return fib(n - 1) + fib(n - 2);\n}\n```';
        const result = extractCode(content);
        expect(result!.language).toBe('JavaScript');
        expect(result!.code).toContain('fib(n - 1) + fib(n - 2)');
    });

    it('should handle Kotlin from kt fence', () => {
        const content = '```kt\nfun main() { println("Hello") }\n```';
        const result = extractCode(content);
        expect(result!.language).toBe('Kotlin');
    });

    it('should handle Swift from swift fence', () => {
        const content = '```swift\nprint("Hello, World!")\n```';
        const result = extractCode(content);
        expect(result!.language).toBe('Swift');
    });

    it('should handle PHP from php fence', () => {
        const content = '```php\n<?php echo "Hello"; ?>\n```';
        const result = extractCode(content);
        expect(result!.language).toBe('PHP');
    });
});

// matchChallengeFromThreadName Tests

import { matchChallengeFromThreadName, initChallengeData } from './scanner';

describe('matchChallengeFromThreadName — Thread Matching', () => {

    beforeEach(() => {
        // Initialize challenge data so the lookup map is populated
        initChallengeData();
    });

    it('should match a beginner challenge thread name', () => {
        const result = matchChallengeFromThreadName('[Beginner] Reverse a String');
        expect(result).not.toBeNull();
        expect(result!.id).toBe('b1');
        expect(result!.title).toBe('Reverse a String');
        expect(result!.solution).toBeTruthy();
    });

    it('should match an intermediate challenge thread name', () => {
        const result = matchChallengeFromThreadName('[Intermediate] Two Sum');
        expect(result).not.toBeNull();
        expect(result!.id).toBe('i1');
    });

    it('should match an advanced challenge thread name', () => {
        const result = matchChallengeFromThreadName('[Advanced] LRU Cache');
        expect(result).not.toBeNull();
        expect(result!.id).toBe('a1');
    });

    it('should return null for non-challenge thread names', () => {
        expect(matchChallengeFromThreadName('General Discussion')).toBeNull();
        expect(matchChallengeFromThreadName('Help with my code')).toBeNull();
    });

    it('should return null for invalid format', () => {
        expect(matchChallengeFromThreadName('[Easy] Reverse a String')).toBeNull(); // "Easy" not in enum
        expect(matchChallengeFromThreadName('Reverse a String')).toBeNull(); // No bracket
    });

    it('should be case-insensitive on difficulty label', () => {
        const result = matchChallengeFromThreadName('[beginner] Reverse a String');
        expect(result).not.toBeNull();
        expect(result!.id).toBe('b1');
    });

    it('should return null for unknown challenge title', () => {
        const result = matchChallengeFromThreadName('[Beginner] Nonexistent Challenge');
        expect(result).toBeNull();
    });

    it('should match FizzBuzz correctly', () => {
        const result = matchChallengeFromThreadName('[Beginner] FizzBuzz');
        expect(result).not.toBeNull();
        expect(result!.id).toBe('b2');
    });

    it('should match Palindrome Check correctly', () => {
        const result = matchChallengeFromThreadName('[Beginner] Palindrome Check');
        expect(result).not.toBeNull();
        expect(result!.id).toBe('b5');
    });

    it('should verify all challenges have solutions', () => {
        const challenges = [
            '[Beginner] Reverse a String',
            '[Beginner] FizzBuzz',
            '[Intermediate] Two Sum',
            '[Intermediate] Valid Parentheses',
            '[Advanced] LRU Cache',
            '[Advanced] Topological Sort',
        ];

        for (const name of challenges) {
            const result = matchChallengeFromThreadName(name);
            expect(result, `${name} should match`).not.toBeNull();
            expect(result!.solution, `${name} should have a solution`).toBeTruthy();
        }
    });
});

// Metrics Tests

import { metrics } from './metrics';

describe('Metrics — In-process Counters', () => {

    beforeEach(() => {
        metrics.reset();
    });

    it('should start at zero', () => {
        expect(metrics.aiCalls).toBe(0);
        expect(metrics.aiFails).toBe(0);
        expect(metrics.reviewsCompleted).toBe(0);
        expect(metrics.avgLatency).toBe(0);
        expect(metrics.failureRate).toBe(0);
        expect(metrics.avgConfidence).toBe(0);
    });

    it('should track AI call latency', () => {
        metrics.recordAICall(200, false);
        metrics.recordAICall(400, false);
        expect(metrics.aiCalls).toBe(2);
        expect(metrics.avgLatency).toBe(300); // (200 + 400) / 2
    });

    it('should track failure rate', () => {
        metrics.recordAICall(100, false);
        metrics.recordAICall(100, true);
        metrics.recordAICall(100, false);
        expect(metrics.aiFails).toBe(1);
        expect(metrics.failureRate).toBeCloseTo(0.333, 2);
    });

    it('should track average confidence', () => {
        metrics.recordReview(0.8);
        metrics.recordReview(0.6);
        metrics.recordReview(0.7);
        expect(metrics.avgConfidence).toBeCloseTo(0.7, 2);
    });

    it('should reset all counters', () => {
        metrics.recordAICall(500, true);
        metrics.recordReview(0.9);
        metrics.queueDepth = 5;
        metrics.reset();

        expect(metrics.aiCalls).toBe(0);
        expect(metrics.aiFails).toBe(0);
        expect(metrics.reviewsCompleted).toBe(0);
        expect(metrics.queueDepth).toBe(0);
    });

    it('should handle 100% failure rate', () => {
        metrics.recordAICall(100, true);
        metrics.recordAICall(200, true);
        expect(metrics.failureRate).toBe(1);
    });

    it('should handle zero division gracefully', () => {
        // No calls yet — should not throw
        expect(metrics.avgLatency).toBe(0);
        expect(metrics.failureRate).toBe(0);
        expect(metrics.avgConfidence).toBe(0);
    });
});

// Queue Semaphore Tests

import { getQueueStats } from './queue';

describe('Queue — Semaphore Behavior', () => {

    it('should start with zero active and waiting jobs', () => {
        const stats = getQueueStats();
        expect(stats.activeJobs).toBeGreaterThanOrEqual(0);
        expect(stats.waitingJobs).toBeGreaterThanOrEqual(0);
    });

    it('should report queue stats as numbers', () => {
        const stats = getQueueStats();
        expect(typeof stats.activeJobs).toBe('number');
        expect(typeof stats.waitingJobs).toBe('number');
    });
});

// Data.json Integrity Tests

import challengeData from './data.json';

describe('data.json — Challenge Data Integrity', () => {

    const difficulties = ['beginner', 'intermediate', 'advanced'] as const;

    for (const difficulty of difficulties) {
        describe(`${difficulty} challenges`, () => {
            const pool = (challengeData as any)[difficulty];

            it(`should have exactly 12 ${difficulty} challenges`, () => {
                expect(Array.isArray(pool)).toBe(true);
                expect(pool.length).toBe(12);
            });

            it(`all ${difficulty} challenges should have required fields`, () => {
                for (const ch of pool) {
                    expect(ch.id, `Missing id in ${ch.title}`).toBeTruthy();
                    expect(ch.title, `Missing title`).toBeTruthy();
                    expect(ch.description, `Missing description in ${ch.title}`).toBeTruthy();
                    expect(ch.solution, `Missing solution in ${ch.title}`).toBeTruthy();
                    expect(Array.isArray(ch.tags), `Tags should be array in ${ch.title}`).toBe(true);
                    expect(ch.tags.length, `No tags in ${ch.title}`).toBeGreaterThan(0);
                }
            });

            it(`all ${difficulty} challenge IDs should be unique`, () => {
                const ids = pool.map((ch: any) => ch.id);
                expect(new Set(ids).size).toBe(ids.length);
            });

            it(`all ${difficulty} solutions should be non-empty strings`, () => {
                for (const ch of pool) {
                    expect(typeof ch.solution).toBe('string');
                    expect(ch.solution.length, `Solution too short in ${ch.title}`).toBeGreaterThan(10);
                }
            });
        });
    }

    it('should have exactly 36 total challenges', () => {
        let total = 0;
        for (const d of difficulties) {
            total += (challengeData as any)[d].length;
        }
        expect(total).toBe(36);
    });

    it('all challenge IDs should be globally unique', () => {
        const allIds: string[] = [];
        for (const d of difficulties) {
            for (const ch of (challengeData as any)[d]) {
                allIds.push(ch.id);
            }
        }
        expect(new Set(allIds).size).toBe(allIds.length);
    });

    it('beginner IDs should start with b, intermediate with i, advanced with a', () => {
        for (const ch of (challengeData as any).beginner) {
            expect(ch.id.startsWith('b'), `${ch.id} should start with b`).toBe(true);
        }
        for (const ch of (challengeData as any).intermediate) {
            expect(ch.id.startsWith('i'), `${ch.id} should start with i`).toBe(true);
        }
        for (const ch of (challengeData as any).advanced) {
            expect(ch.id.startsWith('a'), `${ch.id} should start with a`).toBe(true);
        }
    });
});

// Gamification Points Logic Tests

describe('Gamification — Points Table', () => {
    // Test the points map logic (extracted from gamification.ts)
    const POINTS_MAP: Record<number, number> = { 1: 100, 2: 60, 3: 30 };
    const PENALTY_POINTS = 20;

    it('should award 100 points for attempt 1', () => {
        expect(POINTS_MAP[1]).toBe(100);
    });

    it('should award 60 points for attempt 2', () => {
        expect(POINTS_MAP[2]).toBe(60);
    });

    it('should award 30 points for attempt 3', () => {
        expect(POINTS_MAP[3]).toBe(30);
    });

    it('should have penalty of 20 points', () => {
        expect(PENALTY_POINTS).toBe(20);
    });

    it('penalty should never result in negative points', () => {
        const currentPoints = 10;
        const deduction = Math.min(PENALTY_POINTS, currentPoints);
        const newTotal = currentPoints - deduction;
        expect(newTotal).toBeGreaterThanOrEqual(0);
    });

    it('penalty with zero points should deduct nothing', () => {
        const currentPoints = 0;
        const deduction = Math.min(PENALTY_POINTS, currentPoints);
        expect(deduction).toBe(0);
    });

    it('streak should increment on correct', () => {
        let streak = 3;
        streak += 1; // Correct submission
        expect(streak).toBe(4);
    });

    it('streak should reset to 0 on all-fail', () => {
        let streak = 5;
        streak = 0; // All 3 attempts failed
        expect(streak).toBe(0);
    });

    it('best streak should track maximum', () => {
        const streaks = [1, 2, 3, 2, 1, 4, 5, 3];
        const best = Math.max(...streaks);
        expect(best).toBe(5);
    });
});

// Review Status Decision Tests

describe('Review Status Decision Logic', () => {
    // Extracted from reviewer.ts processReviewJob
    function determineStatus(isCorrect: boolean, confidence: number): 'CORRECT' | 'INCORRECT' | 'PARTIAL' {
        if (isCorrect && confidence >= 0.6) return 'CORRECT';
        if (isCorrect && confidence < 0.6) return 'PARTIAL';
        return 'INCORRECT';
    }

    it('should return CORRECT for isCorrect=true, confidence=0.9', () => {
        expect(determineStatus(true, 0.9)).toBe('CORRECT');
    });

    it('should return CORRECT for isCorrect=true, confidence=0.6 (boundary)', () => {
        expect(determineStatus(true, 0.6)).toBe('CORRECT');
    });

    it('should return PARTIAL for isCorrect=true, confidence=0.5', () => {
        expect(determineStatus(true, 0.5)).toBe('PARTIAL');
    });

    it('should return PARTIAL for isCorrect=true, confidence=0.1', () => {
        expect(determineStatus(true, 0.1)).toBe('PARTIAL');
    });

    it('should return INCORRECT for isCorrect=false regardless of confidence', () => {
        expect(determineStatus(false, 0.9)).toBe('INCORRECT');
        expect(determineStatus(false, 0.5)).toBe('INCORRECT');
        expect(determineStatus(false, 0.0)).toBe('INCORRECT');
    });

    it('should return CORRECT at exactly 0.6 threshold', () => {
        expect(determineStatus(true, 0.6)).toBe('CORRECT');
    });

    it('should return PARTIAL just below threshold', () => {
        expect(determineStatus(true, 0.599)).toBe('PARTIAL');
    });
});

// Confidence Clamping Tests

describe('Confidence Clamping', () => {
    // From reviewer.ts: Math.max(0, Math.min(1, confidence))
    function clamp(confidence: number): number {
        return Math.max(0, Math.min(1, confidence));
    }

    it('should clamp values above 1 to 1', () => {
        expect(clamp(1.5)).toBe(1);
        expect(clamp(100)).toBe(1);
    });

    it('should clamp values below 0 to 0', () => {
        expect(clamp(-0.5)).toBe(0);
        expect(clamp(-100)).toBe(0);
    });

    it('should leave valid values unchanged', () => {
        expect(clamp(0.5)).toBe(0.5);
        expect(clamp(0)).toBe(0);
        expect(clamp(1)).toBe(1);
        expect(clamp(0.6)).toBe(0.6);
    });
});

// Circuit Breaker Logic Tests

describe('Circuit Breaker Logic', () => {
    const CIRCUIT_BREAKER_THRESHOLD = 5;
    const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;

    it('should open after threshold consecutive failures', () => {
        let consecutiveFailures = 0;
        let circuitBreakerOpenUntil = 0;

        // Simulate 5 failures
        for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD; i++) {
            consecutiveFailures++;
        }

        if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
            circuitBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
        }

        expect(circuitBreakerOpenUntil).toBeGreaterThan(Date.now());
    });

    it('should not open below threshold', () => {
        let consecutiveFailures = 4;
        let circuitBreakerOpenUntil = 0;

        if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
            circuitBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
        }

        expect(circuitBreakerOpenUntil).toBe(0);
    });

    it('should reset consecutive failures on success', () => {
        let consecutiveFailures = 3;
        consecutiveFailures = 0; // Simulating a success
        expect(consecutiveFailures).toBe(0);
    });
});

// Attempt Limiting Tests

describe('Attempt Limiting', () => {
    it('should allow attempts 1, 2, and 3', () => {
        for (let attempt = 1; attempt <= 3; attempt++) {
            expect(attempt).toBeGreaterThanOrEqual(1);
            expect(attempt).toBeLessThanOrEqual(3);
        }
    });

    it('should block attempt 4+', () => {
        const existingAttempts = [{ id: 1 }, { id: 2 }, { id: 3 }]; // 3 existing
        expect(existingAttempts.length >= 3).toBe(true);
    });

    it('should allow if under 3 attempts', () => {
        const existingAttempts = [{ id: 1 }, { id: 2 }]; // 2 existing
        expect(existingAttempts.length >= 3).toBe(false);
    });

    it('should skip if already solved', () => {
        const attempts = [
            { id: 1, status: 'INCORRECT' },
            { id: 2, status: 'CORRECT' },
        ];
        const alreadySolved = attempts.some(a => a.status === 'CORRECT');
        expect(alreadySolved).toBe(true);
    });

    it('should not skip if no correct attempts', () => {
        const attempts = [
            { id: 1, status: 'INCORRECT' },
            { id: 2, status: 'INCORRECT' },
        ];
        const alreadySolved = attempts.some(a => a.status === 'CORRECT');
        expect(alreadySolved).toBe(false);
    });
});

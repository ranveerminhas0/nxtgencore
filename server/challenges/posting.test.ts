import { describe, it, expect } from "vitest";
import { getUnpostedChallenges, isAllChallengePoolExhausted } from "./posting";

describe("Challenge posting dedupe helpers", () => {
  const challengeData = {
    beginner: [{ id: "b1" }, { id: "b2" }],
    intermediate: [{ id: "i1" }],
    advanced: [{ id: "a1" }],
  };

  it("filters out already posted challenges", () => {
    const posted = new Set(["b1"]);
    const result = getUnpostedChallenges(challengeData.beginner, posted);
    expect(result).toEqual([{ id: "b2" }]);
  });

  it("returns empty when difficulty pool is fully posted", () => {
    const posted = new Set(["b1", "b2"]);
    const result = getUnpostedChallenges(challengeData.beginner, posted);
    expect(result).toEqual([]);
  });

  it("detects non-exhausted global pool", () => {
    const posted = new Set(["b1", "b2", "i1"]);
    expect(isAllChallengePoolExhausted(challengeData, posted)).toBe(false);
  });

  it("detects fully exhausted global pool", () => {
    const posted = new Set(["b1", "b2", "i1", "a1"]);
    expect(isAllChallengePoolExhausted(challengeData, posted)).toBe(true);
  });
});

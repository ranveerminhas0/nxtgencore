export interface PostedChallengeItem {
  id: string;
}

const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;

/**
 * Keep only challenges that have not yet been posted in this guild.
 */
export function getUnpostedChallenges<T extends PostedChallengeItem>(
  pool: T[],
  postedChallengeIds: Set<string>,
): T[] {
  return pool.filter((challenge) => !postedChallengeIds.has(challenge.id));
}

/**
 * True only when every configured challenge has been posted already.
 */
export function isAllChallengePoolExhausted(
  challengeData: Record<string, PostedChallengeItem[]>,
  postedChallengeIds: Set<string>,
): boolean {
  for (const difficulty of DIFFICULTIES) {
    const pool = challengeData[difficulty];
    if (!Array.isArray(pool)) continue;
    for (const challenge of pool) {
      if (!postedChallengeIds.has(challenge.id)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Picks two players to match from the waiting list (ordered by join time), or null.
 * Kept separate so rank- or filter-based rules can replace it later.
 */
export type PairingRule = (waiting: readonly string[]) => [string, string] | null;

export const firstComeFirstServed: PairingRule = (waiting) => {
  const [first, second] = waiting;
  return first !== undefined && second !== undefined ? [first, second] : null;
};

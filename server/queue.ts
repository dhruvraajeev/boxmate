import type { PairingRule } from "./pairing";

/**
 * Everything the server does with the matchmaking queue goes through this interface,
 * so a shared store (e.g. Redis) can replace the in-memory version when scaling out.
 */
export interface MatchQueue {
  add(playerId: string): void;
  remove(playerId: string): void;
  /** Removes and returns the pair the rule picks, or null if the rule finds none. */
  takePair(rule: PairingRule): [string, string] | null;
}

export class InMemoryQueue implements MatchQueue {
  // A Set keeps insertion order, which is the order players joined.
  private waiting = new Set<string>();

  add(playerId: string): void {
    this.waiting.add(playerId);
  }

  remove(playerId: string): void {
    this.waiting.delete(playerId);
  }

  takePair(rule: PairingRule): [string, string] | null {
    const pair = rule([...this.waiting]);
    if (pair) {
      this.waiting.delete(pair[0]);
      this.waiting.delete(pair[1]);
    }
    return pair;
  }

  get size(): number {
    return this.waiting.size;
  }
}

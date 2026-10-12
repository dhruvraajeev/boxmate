import type { PairingRule } from "./pairing";
import type { MatchQueue } from "./queue";

export interface MatchmakingOptions {
  queue: MatchQueue;
  rule: PairingRule;
  intervalMs: number;
  onPair: (pair: [string, string]) => void;
}

/** Wakes up every intervalMs and pairs as many waiting players as the rule allows. Returns a stop function. */
export function startMatchmaking({ queue, rule, intervalMs, onPair }: MatchmakingOptions): () => void {
  const timer = setInterval(() => {
    let pair = queue.takePair(rule);
    while (pair) {
      onPair(pair);
      pair = queue.takePair(rule);
    }
  }, intervalMs);
  return () => clearInterval(timer);
}

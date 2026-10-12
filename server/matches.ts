/** Who is playing whom. Held in memory; nothing is stored after a match ends. */
export class Matches {
  private opponents = new Map<string, string>();

  start(a: string, b: string): void {
    this.opponents.set(a, b);
    this.opponents.set(b, a);
  }

  opponentOf(playerId: string): string | undefined {
    return this.opponents.get(playerId);
  }

  /** Ends the player's match, if any, and returns the opponent's id. */
  end(playerId: string): string | undefined {
    const opponent = this.opponents.get(playerId);
    this.opponents.delete(playerId);
    if (opponent !== undefined) this.opponents.delete(opponent);
    return opponent;
  }
}

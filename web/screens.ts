export type ScreenName = "lobby" | "finding" | "match";

export function showScreen(name: ScreenName): void {
  for (const screen of document.querySelectorAll<HTMLElement>(".screen")) {
    screen.hidden = screen.id !== name;
  }
}

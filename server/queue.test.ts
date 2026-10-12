import { describe, expect, it } from "vitest";
import { firstComeFirstServed } from "./pairing";
import { InMemoryQueue } from "./queue";

describe("firstComeFirstServed", () => {
  it("pairs the two players who have waited longest", () => {
    expect(firstComeFirstServed(["a", "b", "c"])).toEqual(["a", "b"]);
  });

  it("finds no pair with fewer than two players", () => {
    expect(firstComeFirstServed([])).toBeNull();
    expect(firstComeFirstServed(["a"])).toBeNull();
  });
});

describe("InMemoryQueue", () => {
  it("takes pairs in join order and leaves the odd player waiting", () => {
    const queue = new InMemoryQueue();
    for (const id of ["a", "b", "c"]) queue.add(id);

    expect(queue.takePair(firstComeFirstServed)).toEqual(["a", "b"]);
    expect(queue.takePair(firstComeFirstServed)).toBeNull();
    expect(queue.size).toBe(1);
  });

  it("never pairs a player who left the queue", () => {
    const queue = new InMemoryQueue();
    for (const id of ["a", "b", "c"]) queue.add(id);
    queue.remove("a");

    expect(queue.takePair(firstComeFirstServed)).toEqual(["b", "c"]);
  });

  it("doesn't queue the same player twice", () => {
    const queue = new InMemoryQueue();
    queue.add("a");
    queue.add("a");

    expect(queue.takePair(firstComeFirstServed)).toBeNull();
  });
});

import type { ClientMessage, SignalPayload } from "../shared/protocol";

// Browsers are untrusted: anything that doesn't match the protocol is dropped.

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSignalPayload(value: unknown): value is SignalPayload {
  if (!isObject(value)) return false;
  if (value.kind === "description") {
    const d = value.description;
    return isObject(d) && (d.type === "offer" || d.type === "answer") && typeof d.sdp === "string";
  }
  if (value.kind === "candidate") {
    const c = value.candidate;
    return isObject(c) && typeof c.candidate === "string";
  }
  return false;
}

export function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (isObject(value) && value.type === "signal" && isSignalPayload(value.payload)) {
    return { type: "signal", payload: value.payload };
  }
  return null;
}

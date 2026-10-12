// Messages exchanged over the WebSocket between browser and server.
// Opening the WebSocket ("Find match") is what puts a player in the queue.

/** WebRTC handshake data the server relays between the two matched players without reading it. */
export type SignalPayload =
  | { kind: "description"; description: { type: "offer" | "answer"; sdp: string } }
  | {
      kind: "candidate";
      candidate: {
        candidate: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
        usernameFragment?: string | null;
      };
    };

export type ClientMessage = { type: "signal"; payload: SignalPayload };

export type ServerMessage =
  | { type: "queued" }
  // The initiator sends the WebRTC offer; the other player waits for it and answers.
  | { type: "matched"; initiator: boolean }
  | { type: "signal"; payload: SignalPayload };

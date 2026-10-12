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

/** Same shape as the browser's RTCIceServer: a STUN server, or a TURN relay with short-lived credentials. */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type ClientMessage = { type: "signal"; payload: SignalPayload };

export type ServerMessage =
  | { type: "queued" }
  // The initiator sends the WebRTC offer; the other player waits for it and answers.
  // Both players get the same ICE servers, fetched once per match.
  | { type: "matched"; initiator: boolean; iceServers: IceServer[] }
  | { type: "signal"; payload: SignalPayload }
  // The match partner left, lost their connection or went silent. The match is over.
  | { type: "opponent-left" };

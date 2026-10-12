import type { IceServer, SignalPayload } from "../shared/protocol";

export interface PeerEvents {
  sendSignal(payload: SignalPayload): void;
  onRemoteStream(stream: MediaStream): void;
  onStateChange(state: RTCPeerConnectionState): void;
}

export interface Peer {
  handleSignal(payload: SignalPayload): void;
  close(): void;
}

/**
 * The WebRTC connection to the opponent. The initiator sends the offer; the other side answers.
 * Only one side offering avoids both browsers starting a handshake at once.
 * iceServers come from the server: STUN, plus a TURN relay for networks that block direct video.
 */
export function createPeer(localStream: MediaStream, initiator: boolean, iceServers: IceServer[], events: PeerEvents): Peer {
  const pc = new RTCPeerConnection({ iceServers });
  // ICE candidates can arrive before the offer/answer they belong to; hold them until then.
  const pendingCandidates: RTCIceCandidateInit[] = [];
  // Signals are handled one at a time, in arrival order.
  let signalChain = Promise.resolve();

  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

  pc.addEventListener("icecandidate", ({ candidate }) => {
    if (!candidate) return;
    const { sdpMid, sdpMLineIndex, usernameFragment } = candidate;
    events.sendSignal({ kind: "candidate", candidate: { candidate: candidate.candidate, sdpMid, sdpMLineIndex, usernameFragment } });
  });
  pc.addEventListener("track", ({ streams, track }) => {
    events.onRemoteStream(streams[0] ?? new MediaStream([track]));
  });
  pc.addEventListener("connectionstatechange", () => events.onStateChange(pc.connectionState));

  function sendLocalDescription(): void {
    const description = pc.localDescription;
    if (description && (description.type === "offer" || description.type === "answer")) {
      events.sendSignal({ kind: "description", description: { type: description.type, sdp: description.sdp } });
    }
  }

  async function applySignal(payload: SignalPayload): Promise<void> {
    if (payload.kind === "description") {
      await pc.setRemoteDescription(payload.description);
      for (const candidate of pendingCandidates.splice(0)) await pc.addIceCandidate(candidate);
      if (payload.description.type === "offer") {
        await pc.setLocalDescription();
        sendLocalDescription();
      }
    } else if (pc.remoteDescription) {
      await pc.addIceCandidate(payload.candidate);
    } else {
      pendingCandidates.push(payload.candidate);
    }
  }

  if (initiator) {
    signalChain = pc.setLocalDescription().then(sendLocalDescription);
  }

  return {
    handleSignal(payload) {
      signalChain = signalChain.then(() => applySignal(payload)).catch((error) => console.error("WebRTC signal failed", error));
    },
    close() {
      pc.close();
    },
  };
}

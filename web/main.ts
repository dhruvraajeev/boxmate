import "./style.css";
import type { ServerMessage } from "../shared/protocol";
import { openCamera, releaseCamera } from "./media";
import { createPeer, type Peer } from "./peer";
import { showScreen } from "./screens";
import { connectSignaling, type Signaling } from "./signaling";

// Screen controller: lobby → finding match → match. Modules report events; this file decides what the user sees.

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

const findMatchButton = byId<HTMLButtonElement>("find-match");
const cancelButton = byId<HTMLButtonElement>("cancel");
const leaveButton = byId<HTMLButtonElement>("leave");
const lobbyMessage = byId<HTMLParagraphElement>("lobby-message");
const connectionStatus = byId<HTMLParagraphElement>("connection-status");
const localVideo = byId<HTMLVideoElement>("local-video");
const remoteVideo = byId<HTMLVideoElement>("remote-video");

// How long video gets to connect after "matched", and how long it may stay interrupted mid-match.
const SETUP_TIMEOUT_MS = 15_000;
const DISCONNECTED_GRACE_MS = 5000;
const COULDNT_CONNECT = "Couldn't connect to opponent.";

const STATE_LABELS: Record<RTCPeerConnectionState, string> = {
  new: "Connecting video…",
  connecting: "Connecting video…",
  connected: "Connected",
  disconnected: "Video interrupted…",
  failed: "Couldn't connect video to your opponent",
  closed: "",
};

interface Session {
  camera: MediaStream;
  signaling: Signaling;
  peer?: Peer;
  /** Ends the match with COULDNT_CONNECT unless video connects first. */
  videoDeadline?: ReturnType<typeof setTimeout>;
}

let session: Session | null = null;

async function findMatch(): Promise<void> {
  lobbyMessage.textContent = "";
  findMatchButton.disabled = true;

  let camera: MediaStream;
  try {
    camera = await openCamera();
  } catch {
    lobbyMessage.textContent = "boxmate needs your camera to play. Allow camera access and try again.";
    findMatchButton.disabled = false;
    return;
  }

  showScreen("finding");
  const current: Session = {
    camera,
    signaling: connectSignaling({
      onMessage: (message) => handleServerMessage(current, message),
      onLost: () => endSession(current, "Connection lost."),
    }),
  };
  session = current;
}

function handleServerMessage(current: Session, message: ServerMessage): void {
  if (session !== current) return;

  switch (message.type) {
    case "queued":
      break;
    case "matched":
      localVideo.srcObject = current.camera;
      connectionStatus.textContent = STATE_LABELS.new;
      showScreen("match");
      current.videoDeadline = setTimeout(() => endSession(current, COULDNT_CONNECT), SETUP_TIMEOUT_MS);
      current.peer = createPeer(current.camera, message.initiator, message.iceServers, {
        sendSignal: (payload) => current.signaling.send({ type: "signal", payload }),
        onRemoteStream: (stream) => {
          remoteVideo.srcObject = stream;
        },
        onStateChange: (state) => {
          if (session !== current) return;
          connectionStatus.textContent = STATE_LABELS[state];
          watchVideo(current, state);
        },
      });
      break;
    case "opponent-left":
      endSession(current, "Opponent left.");
      break;
    case "signal":
      current.peer?.handleSignal(message.payload);
      break;
  }
}

/** Gives up on a match whose video failed, or stayed interrupted too long. Closing tells the opponent via the server. */
function watchVideo(current: Session, state: RTCPeerConnectionState): void {
  if (state === "connected") {
    clearTimeout(current.videoDeadline);
    current.videoDeadline = undefined;
  } else if (state === "failed") {
    endSession(current, COULDNT_CONNECT);
  } else if (state === "disconnected" && current.videoDeadline === undefined) {
    // WebRTC often recovers from a short blip on its own, so wait before ending the match.
    current.videoDeadline = setTimeout(() => endSession(current, COULDNT_CONNECT), DISCONNECTED_GRACE_MS);
  }
}

/** Closes the peer connection and WebSocket, releases the webcam, and returns to the lobby. */
function endSession(current: Session, message = ""): void {
  if (session !== current) return;
  session = null;

  clearTimeout(current.videoDeadline);
  current.peer?.close();
  current.signaling.close();
  releaseCamera(current.camera);
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;

  lobbyMessage.textContent = message;
  findMatchButton.disabled = false;
  showScreen("lobby");
}

findMatchButton.addEventListener("click", () => void findMatch());
cancelButton.addEventListener("click", () => session && endSession(session));
leaveButton.addEventListener("click", () => session && endSession(session));

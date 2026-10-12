/** Opens the user's webcam. Rejects if permission is denied or the page isn't on HTTPS/localhost. */
export async function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera access needs HTTPS");
  }
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
}

/** Stops every track so the browser's camera light turns off. */
export function releaseCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

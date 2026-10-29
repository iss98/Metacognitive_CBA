import { API_BASE } from "./api";
import type { TranscriptSegment } from "./types";

interface RealtimeConnection {
  stop: () => Promise<void>;
}

export async function connectRealtimeTranscription(
  sessionId: string,
  stream: MediaStream,
  onCompleted: (segment: TranscriptSegment) => void,
): Promise<RealtimeConnection> {
  const tokenResponse = await fetch(`${API_BASE}/sessions/${sessionId}/transcription-token`, {
    method: "POST",
  });
  if (!tokenResponse.ok) {
    const payload = await tokenResponse.json().catch(() => ({}));
    throw new Error(payload.detail ?? "실시간 전사 세션을 만들 수 없습니다.");
  }
  const tokenPayload = await tokenResponse.json();
  const ephemeralKey = tokenPayload.value;
  if (!ephemeralKey) throw new Error("전사 세션의 단기 키가 없습니다.");

  const peer = new RTCPeerConnection();
  const dataChannel = peer.createDataChannel("oai-events");
  stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));

  dataChannel.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "conversation.item.input_audio_transcription.completed") {
      onCompleted({
        item_id: payload.item_id,
        text: payload.transcript,
        source: "realtime",
      });
    }
  });

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${ephemeralKey}`,
      "Content-Type": "application/sdp",
    },
  });
  if (!sdpResponse.ok) {
    peer.close();
    throw new Error("OpenAI WebRTC 연결을 시작하지 못했습니다.");
  }
  await peer.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });

  return {
    stop: async () => {
      if (dataChannel.readyState === "open") {
        dataChannel.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }
      dataChannel.close();
      peer.close();
    },
  };
}


import type { Problem, StudySession, SurveyItem, TranscriptSegment } from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let message = `요청을 처리하지 못했습니다 (${response.status})`;
    try {
      const payload = await response.json();
      message = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail);
    } catch {
      // Keep the HTTP status fallback.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  getProblem: () => request<Problem>("/problem"),
  getSurveyItems: () => request<SurveyItem[]>("/survey-items"),
  createSession: (participantCode: string) =>
    request<StudySession>("/sessions", {
      method: "POST",
      body: JSON.stringify({ participant_code: participantCode }),
    }),
  getSession: (sessionId: string) => request<StudySession>(`/sessions/${sessionId}`),
  listSessions: () => request<Array<Pick<StudySession, "id" | "participant_code" | "state" | "execution_mode"> & { updated_at: string }>>("/sessions"),
  completeAudioCheck: (sessionId: string, transcript: string) =>
    request<StudySession>(`/sessions/${sessionId}/audio-check`, {
      method: "POST",
      body: JSON.stringify({ transcript }),
    }),
  submitSurvey: (sessionId: string, responses: Array<{ item_id: string; score: number; factor: string; display_order: number }>) =>
    request<StudySession>(`/sessions/${sessionId}/survey`, {
      method: "PUT",
      body: JSON.stringify({ responses }),
    }),
  startRecording: (sessionId: string) =>
    request<StudySession>(`/sessions/${sessionId}/recording/start`, { method: "POST" }),
  submitTranscript: (sessionId: string, segments: TranscriptSegment[]) =>
    request<StudySession>(`/sessions/${sessionId}/transcript-turns`, {
      method: "POST",
      body: JSON.stringify({ segments }),
    }),
  uploadAudio: async (sessionId: string, blob: Blob) => {
    const form = new FormData();
    form.append("audio", blob, "think-aloud.webm");
    return request<StudySession>(`/sessions/${sessionId}/audio`, { method: "POST", body: form });
  },
  completeRecording: (sessionId: string) =>
    request<StudySession>(`/sessions/${sessionId}/recording/complete`, { method: "POST" }),
  recoverTranscript: (sessionId: string) =>
    request<StudySession>(`/sessions/${sessionId}/transcription/recover`, { method: "POST" }),
  prepareInterview: (sessionId: string) =>
    request<StudySession>(`/sessions/${sessionId}/prepare-interview`, { method: "POST" }),
  startInterview: (sessionId: string) =>
    request<StudySession>(`/sessions/${sessionId}/interview/start`, { method: "POST" }),
  answerInterview: (sessionId: string, questionId: string, text: string) =>
    request<StudySession>(`/sessions/${sessionId}/interview/answers`, {
      method: "POST",
      body: JSON.stringify({ question_id: questionId, text }),
    }),
  rate: (sessionId: string) =>
    request<StudySession>(`/sessions/${sessionId}/rate`, { method: "POST" }),
  saveComparison: (sessionId: string, choice: string, note: string) =>
    request<StudySession>(`/sessions/${sessionId}/comparison`, {
      method: "PUT",
      body: JSON.stringify({ choice, note }),
    }),
};


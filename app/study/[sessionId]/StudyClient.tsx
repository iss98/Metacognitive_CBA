"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import katex from "katex";
import { StageRail } from "@/components/StageRail";
import { StatusMessage } from "@/components/StatusMessage";
import { api } from "@/lib/api";
import { connectRealtimeTranscription } from "@/lib/realtime";
import { surveyMeans } from "@/lib/scores";
import {
  factorLabels,
  type Factor,
  type Problem,
  type StudySession,
  type SurveyItem,
  type TranscriptSegment,
} from "@/lib/types";

const likert = [
  { value: 1, label: "전혀 아니다" },
  { value: 2, label: "아니다" },
  { value: 3, label: "보통이다" },
  { value: 4, label: "그렇다" },
  { value: 5, label: "매우 그렇다" },
];

const previewSteps = [
  { id: "audio", label: "음성 확인", state: "audio_check" },
  { id: "survey", label: "설문", state: "created" },
  { id: "problem", label: "문제 풀이", state: "survey_done" },
  { id: "transcript", label: "풀이 저장", state: "transcript_ready" },
  { id: "ready", label: "대화 준비", state: "questions_ready" },
  { id: "interview", label: "풀이 대화", state: "interviewing" },
  { id: "interview-done", label: "대화 완료", state: "interview_done" },
  { id: "results", label: "결과 비교", state: "results_ready" },
] as const;

type PreviewStepId = (typeof previewSteps)[number]["id"];

export function StudyClient({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<StudySession | null>(null);
  const [surveyItems, setSurveyItems] = useState<SurveyItem[]>([]);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const current = await api.getSession(sessionId);
    setSession(current);
  }, [sessionId]);

  useEffect(() => {
    Promise.all([api.getSession(sessionId), api.getSurveyItems(), api.getProblem()])
      .then(([current, items, currentProblem]) => {
        setSession(current);
        setSurveyItems(items);
        setProblem(currentProblem);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "자료를 불러오지 못했습니다."));
  }, [sessionId]);

  async function run(action: () => Promise<StudySession>) {
    setBusy(true);
    setError("");
    try {
      setSession(await action());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요청을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return <main className="loading-screen">{error || "실험 기록을 불러오는 중…"}</main>;
  }

  return (
    <div className="study-shell">
      <StageRail state={session.state} />
      <main className="study-main">
        <header className="study-header">
          <Link href="/" className="wordmark">생각의 결</Link>
          <div className="session-meta">
            <span>{session.participant_code}</span>
            {session.execution_mode === "demo" && <span className="demo-badge">데모 모드</span>}
          </div>
        </header>
        <StatusMessage error={error} />

        {session.state === "audio_check" && (
          <AudioCheckPanel
            sessionId={session.id}
            busy={busy}
            onComplete={(transcript) => run(() => api.completeAudioCheck(session.id, transcript))}
            onError={setError}
          />
        )}

        {session.state === "created" && (
          <SurveyPanel
            items={surveyItems}
            order={session.survey_order}
            busy={busy}
            onSubmit={(responses) => run(() => api.submitSurvey(sessionId, responses))}
          />
        )}

        {["survey_done", "recording"].includes(session.state) && problem && (
          <RecordingPanel
            key={session.state}
            session={session}
            problem={problem}
            busy={busy}
            onSession={setSession}
            onError={setError}
            onReady={refresh}
          />
        )}

        {["transcript_ready", "schema_ready"].includes(session.state) && (
          <TransitionPanel
            title="풀이 기록이 안전하게 저장되었습니다."
            text="이제 문제를 풀며 실제로 말한 내용을 정리하고, 풀이를 되짚는 질문 10개를 준비합니다."
            action="풀이 대화 준비하기"
            busy={busy}
            onClick={() => run(() => api.prepareInterview(sessionId))}
          />
        )}

        {session.state === "questions_ready" && (
          <TransitionPanel
            title="풀이 대화를 시작할 준비가 됐습니다."
            text="기본 질문 10개를 모두 순서대로 묻습니다. 한 질문에 답이 부족하면 그 질문에 대해서만 짧은 추가 질문이 나옵니다."
            action="채팅으로 대화 시작하기"
            busy={busy}
            onClick={() => run(() => api.startInterview(sessionId))}
          />
        )}

        {session.state === "interviewing" && (
          <InterviewPanel session={session} busy={busy} onAnswer={(questionId, text) => run(() => api.answerInterview(sessionId, questionId, text))} />
        )}

        {session.state === "interview_done" && (
          <TransitionPanel
            title="10개 기본 질문을 모두 마쳤습니다."
            text="각 질문의 답변과 문제를 풀며 말한 내용을 함께 살펴보고, 질문별 결과와 영역별 평균을 만듭니다."
            action="결과 만들기"
            busy={busy}
            onClick={() => run(() => api.rate(sessionId))}
          />
        )}

        {["results_ready", "comparison_done"].includes(session.state) && (
          <ResultsPanel
            session={session}
            surveyItems={surveyItems}
            busy={busy}
            onChoose={(choice, note) => run(() => api.saveComparison(sessionId, choice, note))}
          />
        )}
      </main>
    </div>
  );
}

export function TestPreviewClient() {
  const [surveyItems, setSurveyItems] = useState<SurveyItem[]>([]);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [step, setStep] = useState<PreviewStepId>("audio");
  const [extraTurns, setExtraTurns] = useState<StudySession["interview_turns"]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.getSurveyItems(), api.getProblem()])
      .then(([items, currentProblem]) => {
        setSurveyItems(items);
        setProblem(currentProblem);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "테스트 자료를 불러오지 못했습니다."));
  }, []);

  const currentIndex = previewSteps.findIndex((item) => item.id === step);
  const currentStep = previewSteps[currentIndex];
  const previewSession = useMemo(() => buildPreviewSession(surveyItems, extraTurns), [surveyItems, extraTurns]);
  const displayedSession = { ...previewSession, state: currentStep.state } as StudySession;

  function move(offset: number) {
    const nextIndex = Math.min(previewSteps.length - 1, Math.max(0, currentIndex + offset));
    setStep(previewSteps[nextIndex].id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function choose(nextStep: PreviewStepId) {
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!problem || !surveyItems.length) {
    return <main className="loading-screen">{error || "절차 테스트 화면을 준비하는 중…"}</main>;
  }

  return (
    <div className="study-shell preview-shell">
      <StageRail state={displayedSession.state} />
      <main className="study-main">
        <nav className="test-mode-nav" aria-label="테스트 화면 이동">
          <div className="test-mode-heading">
            <span>절차 자료용 테스트 모드</span>
            <strong>{currentIndex + 1} / {previewSteps.length} · {currentStep.label}</strong>
          </div>
          <div className="test-step-list">
            {previewSteps.map((item, index) => (
              <button
                key={item.id}
                className={item.id === step ? "active" : ""}
                aria-current={item.id === step ? "step" : undefined}
                onClick={() => choose(item.id)}
              >
                <span>{index + 1}</span>{item.label}
              </button>
            ))}
          </div>
          <div className="test-mode-arrows">
            <button disabled={currentIndex === 0} onClick={() => move(-1)}>이전 화면</button>
            <button disabled={currentIndex === previewSteps.length - 1} onClick={() => move(1)}>다음 화면</button>
          </div>
        </nav>

        <header className="study-header preview-header">
          <Link href="/" className="wordmark">생각의 결</Link>
          <div className="session-meta"><span>PREVIEW</span><span className="preview-badge">저장 안 함</span></div>
        </header>
        <StatusMessage error={error} />

        {step === "audio" && (
          <AudioCheckPanel
            sessionId="preview"
            busy={false}
            previewMode
            onComplete={() => choose("survey")}
            onError={setError}
          />
        )}
        {step === "survey" && (
          <SurveyPanel items={surveyItems} order={displayedSession.survey_order} busy={false} onSubmit={() => choose("problem")} />
        )}
        {step === "problem" && (
          <RecordingPanel
            session={displayedSession}
            problem={problem}
            busy={false}
            previewMode
            onSession={() => undefined}
            onError={setError}
            onReady={async () => choose("transcript")}
          />
        )}
        {step === "transcript" && (
          <TransitionPanel
            title="풀이 기록이 안전하게 저장되었습니다."
            text="이제 문제를 풀며 실제로 말한 내용을 정리하고, 풀이를 되짚는 질문 10개를 준비합니다."
            action="풀이 대화 준비하기"
            busy={false}
            onClick={() => choose("ready")}
          />
        )}
        {step === "ready" && (
          <TransitionPanel
            title="풀이 대화를 시작할 준비가 됐습니다."
            text="기본 질문 10개를 모두 순서대로 묻습니다. 한 질문에 답이 부족하면 그 질문에 대해서만 짧은 추가 질문이 나옵니다."
            action="채팅으로 대화 시작하기"
            busy={false}
            onClick={() => choose("interview")}
          />
        )}
        {step === "interview" && (
          <InterviewPanel
            session={displayedSession}
            busy={false}
            onAnswer={(questionId, text) => setExtraTurns((current) => [
              ...current,
              { id: `preview-answer-${current.length}`, question_id: questionId, role: "student", text, kind: "answer" },
              { id: `preview-followup-${current.length}`, question_id: questionId, role: "assistant", text: "그 판단을 하게 된 구체적인 단서를 한 가지 더 말해 줄 수 있나요?", kind: "followup" },
            ])}
          />
        )}
        {step === "interview-done" && (
          <TransitionPanel
            title="10개 기본 질문을 모두 마쳤습니다."
            text="각 질문의 답변과 문제를 풀며 말한 내용을 함께 살펴보고, 질문별 결과와 영역별 평균을 만듭니다."
            action="결과 만들기"
            busy={false}
            onClick={() => choose("results")}
          />
        )}
        {step === "results" && (
          <ResultsPanel session={displayedSession} surveyItems={surveyItems} busy={false} onChoose={() => undefined} />
        )}
      </main>
    </div>
  );
}

function buildPreviewSession(items: SurveyItem[], extraTurns: StudySession["interview_turns"]): StudySession {
  const factors: Factor[] = [
    "planning", "monitoring", "debugging", "evaluation",
    "declarative_knowledge", "declarative_knowledge",
    "procedural_knowledge", "procedural_knowledge",
    "conditional_knowledge", "conditional_knowledge",
  ];
  const questions = factors.map((factor, index) => ({
    id: `preview-q-${index + 1}`,
    order: index + 1,
    factor,
    text: index === 2
      ? "처음 세운 방법으로 답이 나오지 않았을 때, 어떤 점을 확인하고 다음 방법을 정했나요?"
      : `${factorLabels[factor]}과 관련해 문제를 풀던 당시의 판단을 구체적으로 설명해 주세요.`,
    direction: ([5, 7, 9].includes(index) ? "reverse" : "direct") as "direct" | "reverse",
    intent: "절차 자료 제작을 위한 예시 질문",
    status: (index < 2 ? "answered" : index === 2 ? "active" : "pending") as "pending" | "active" | "answered",
    followup_count: index === 2 ? 1 : 0,
  }));
  const baseTurns: StudySession["interview_turns"] = [
    { id: "preview-turn-1", question_id: "preview-q-1", role: "assistant", text: "문제를 처음 읽었을 때 어떤 순서로 풀려고 했나요?", kind: "base_question" },
    { id: "preview-turn-2", question_id: "preview-q-1", role: "student", text: "먼저 경우를 나누고, 원탁에서 서로 이웃하면 안 되는 조건을 하나씩 확인하려고 했습니다.", kind: "answer" },
    { id: "preview-turn-3", question_id: "preview-q-2", role: "assistant", text: "풀이를 시작하기 전에 답이 어느 정도일지 예상해 보았나요?", kind: "base_question" },
    { id: "preview-turn-4", question_id: "preview-q-2", role: "student", text: "정확한 값은 예상하지 못했지만 전체 경우보다 크게 줄어들 거라고 생각했습니다.", kind: "answer" },
    { id: "preview-turn-5", question_id: "preview-q-3", role: "assistant", text: "처음 세운 방법으로 답이 나오지 않았을 때, 어떤 점을 확인하고 다음 방법을 정했나요?", kind: "base_question" },
  ];
  const itemRatings = questions.map((question, index) => ({
    question_id: question.id,
    factor: question.factor,
    question_direction: question.direction,
    score: 3 + (index % 3),
    status: "rated" as const,
    reason: "답변에서 자신의 판단 근거와 풀이 행동을 구체적으로 설명했습니다.",
    evidence_alignment: "인터뷰 답변과 풀이 기록이 대체로 일치합니다.",
    response_consistency: "질문 전반에서 일관된 설명을 보였습니다.",
  }));
  const uniqueFactors = [...new Set(factors)];
  const factorRatings = uniqueFactors.map((factor) => {
    const factorItems = itemRatings.filter((rating) => rating.factor === factor);
    return {
      factor,
      item_scores: factorItems.map((rating) => ({ question_id: rating.question_id, score: rating.score })),
      factor_score: factorItems.reduce((sum, rating) => sum + rating.score, 0) / factorItems.length,
      rated_item_count: factorItems.length,
      total_item_count: factorItems.length,
      coverage: "complete" as const,
    };
  });
  return {
    id: "preview",
    participant_code: "PREVIEW",
    state: "audio_check",
    audio_check: null,
    survey_order: items.map((item) => item.id),
    survey_responses: items.map((item, index) => ({ item_id: item.id, score: 3 + (index % 3), factor: item.factor, display_order: index + 1 })),
    transcript_segments: [{ id: "preview-segment", order: 1, source: "manual", text: "먼저 전체 경우를 생각하고, 이웃하면 안 되는 조건을 확인해 보겠습니다." }],
    questions,
    interview_turns: [...baseTurns, ...extraTurns],
    current_question_index: 2,
    item_ratings: itemRatings,
    factor_ratings: factorRatings,
    comparison: null,
    execution_mode: "demo",
  };
}

function AudioCheckPanel({
  sessionId,
  busy,
  previewMode = false,
  onComplete,
  onError,
}: {
  sessionId: string;
  busy: boolean;
  previewMode?: boolean;
  onComplete: (transcript: string) => void;
  onError: (message: string) => void;
}) {
  const expected = "안녕하세요? 오늘 날씨가 참 좋습니다.";
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [manualTranscript, setManualTranscript] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [note, setNote] = useState("마이크 사용 권한을 확인한 뒤 짧은 문장을 읽습니다.");
  const streamRef = useRef<MediaStream | null>(null);
  const realtimeRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const liveTranscriptRef = useRef("");

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  async function start() {
    onError("");
    setTranscript("");
    setLiveTranscript("");
    liveTranscriptRef.current = "";
    setManualTranscript("");
    setManualMode(false);
    setAttempted(true);
    if (previewMode) {
      setManualMode(true);
      setNote("테스트 모드에서는 직접 입력해 전사 확인 화면을 재현합니다.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      realtimeRef.current = await connectRealtimeTranscription(
        sessionId,
        stream,
        (segment) => {
          setTranscript((current) => `${current} ${segment.text}`.trim());
          setLiveTranscript("");
          liveTranscriptRef.current = "";
        },
        (delta) => {
          liveTranscriptRef.current += delta.text;
          setLiveTranscript(liveTranscriptRef.current);
        },
      );
      setRecording(true);
      setNote("문장을 또박또박 읽은 뒤 ‘입력 중지’를 눌러 주세요.");
    } catch (caught) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setRecording(false);
      setManualMode(true);
      setNote("실시간 전사를 연결하지 못했습니다. 아래 입력란에서 화면 흐름을 확인할 수 있습니다.");
      onError(caught instanceof Error ? caught.message : "음성 입력을 시작하지 못했습니다.");
    }
  }

  async function stop() {
    setRecording(false);
    setNote("전사 결과를 확인하고, 다르면 다시 시도해 주세요.");
    await realtimeRef.current?.stop().catch(() => undefined);
    if (liveTranscriptRef.current.trim()) {
      setTranscript((current) => current || liveTranscriptRef.current.trim());
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    realtimeRef.current = null;
  }

  const confirmedText = transcript.trim() || manualTranscript.trim();
  return (
    <section className="work-surface audio-check-surface">
      <div className="surface-heading">
        <div><p className="step-kicker">시작 전 확인</p><h1>마이크와 음성 입력을 확인합니다.</h1></div>
        <span className={recording ? "recording-pill live" : "recording-pill"}><i />{recording ? "듣는 중" : "대기 중"}</span>
      </div>
      <p className="instruction">조용한 공간에서 아래 문장을 그대로 읽어 주세요. 이 확인 문장은 문제 풀이 자료에 포함되지 않습니다.</p>
      <blockquote className="voice-check-phrase">“{expected}”</blockquote>
      <div className="voice-check-controls">
        {!recording && <button className="record-button" onClick={start}><span />{confirmedText ? "다시 입력하기" : "음성 입력 시작"}</button>}
        {recording && <button className="record-button stop" onClick={stop}><span />입력 중지</button>}
        <p>{note}</p>
      </div>
      {attempted && (
        <div className={recording ? "voice-check-result live" : "voice-check-result"} aria-live="polite">
          <div>
            <span>{recording ? "실시간으로 인식 중" : "전사된 문장"}</span>
            <strong>{transcript || liveTranscript || (recording ? "말씀해 주세요…" : "전사 결과가 아직 없습니다.")}</strong>
          </div>
          {!recording && (manualMode || (!transcript && !liveTranscript)) && (
            <label htmlFor="manual-audio-check">로컬 데모용 직접 입력
              <input id="manual-audio-check" value={manualTranscript} onChange={(event) => setManualTranscript(event.target.value)} placeholder={expected} />
            </label>
          )}
          <button className="primary-button" disabled={recording || busy || !confirmedText} onClick={() => onComplete(confirmedText)}>
            {busy ? "저장하는 중…" : "이 결과로 설문 시작하기"}
          </button>
        </div>
      )}
    </section>
  );
}

function SurveyPanel({
  items,
  order,
  busy,
  onSubmit,
}: {
  items: SurveyItem[];
  order: string[];
  busy: boolean;
  onSubmit: (responses: Array<{ item_id: string; score: number; factor: Factor; display_order: number }>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const completed = Object.keys(answers).length;
  const orderedItems = useMemo(() => {
    const position = new Map(order.map((itemId, index) => [itemId, index]));
    return [...items].sort((left, right) => (position.get(left.id) ?? items.length) - (position.get(right.id) ?? items.length));
  }, [items, order]);

  return (
    <section className="work-surface survey-surface">
      <div className="surface-heading">
        <div><p className="step-kicker">1단계 · 설문</p><h1>평소의 나와 가까운 정도를 표시해 주세요.</h1></div>
        <p className="completion-count"><strong>{completed}</strong> / {items.length}</p>
      </div>
      <p className="instruction">정답은 없습니다. 오래 고민하기보다 평소의 모습에 가장 가까운 응답을 선택하세요.</p>
      <div className="survey-groups">
        <fieldset>
          <legend className="sr-only">설문 문항</legend>
            {orderedItems.map((item, index) => (
              <div className="survey-item" key={item.id}>
                <span className="survey-item-number">문항 {index + 1}</span>
                <p>{item.text}</p>
                <div className="likert-row" role="radiogroup" aria-label={item.text}>
                  {likert.map((choice) => (
                    <label key={choice.value} className={answers[item.id] === choice.value ? "selected" : ""}>
                      <input
                        type="radio"
                        name={item.id}
                        value={choice.value}
                        checked={answers[item.id] === choice.value}
                        onChange={() => setAnswers((current) => ({ ...current, [item.id]: choice.value }))}
                      />
                      <span>{choice.value}</span>
                      <small>{choice.label}</small>
                    </label>
                  ))}
                </div>
              </div>
            ))}
        </fieldset>
      </div>
      <div className="sticky-action">
        <p>{completed < items.length ? `${items.length - completed}개 문항이 남았습니다.` : "모든 문항에 응답했습니다."}</p>
        <button
          className="primary-button"
          disabled={busy || completed !== items.length}
          onClick={() => onSubmit(orderedItems.map((item, index) => ({ item_id: item.id, score: answers[item.id], factor: item.factor, display_order: index + 1 })))}
        >
          {busy ? "저장하는 중…" : "응답 저장하고 문제 풀기"}
        </button>
      </div>
    </section>
  );
}

function RecordingPanel({
  session,
  problem,
  onSession,
  onError,
  onReady,
  previewMode = false,
}: {
  session: StudySession;
  problem: Problem;
  busy: boolean;
  onSession: (session: StudySession) => void;
  onError: (message: string) => void;
  onReady: () => Promise<void>;
  previewMode?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [manualTranscript, setManualTranscript] = useState("");
  const [segments, setSegments] = useState<TranscriptSegment[]>(session.transcript_segments ?? []);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [connectionNote, setConnectionNote] = useState("마이크를 시작하면 실시간 전사를 연결합니다.");
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const realtime = useRef<{ stop: () => Promise<void> } | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const audioBlob = useRef<Blob | null>(null);
  const liveTranscriptRef = useRef("");

  useEffect(() => () => {
    if (timer.current) window.clearInterval(timer.current);
    mediaStream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function start() {
    if (preparing || recording) return;
    onError("");
    setPreparing(true);
    if (previewMode) {
      setRecording(true);
      setPreparing(false);
      setRecorded(false);
      setSeconds(0);
      setConnectionNote("테스트 모드에서 녹음 화면을 재현하고 있습니다. 실제 음성은 저장되지 않습니다.");
      timer.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
      return;
    }
    try {
      const updated = await api.startRecording(session.id);
      onSession(updated);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStream.current = stream;
      const preferred = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: preferred });
      chunks.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      recorder.onstop = () => { audioBlob.current = new Blob(chunks.current, { type: preferred }); };
      recorder.onstart = () => {
        setRecording(true);
        setPreparing(false);
        setSeconds(0);
        timer.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
      };
      mediaRecorder.current = recorder;
      setLiveTranscript("");
      liveTranscriptRef.current = "";
      recorder.start(1000);
      try {
        realtime.current = await connectRealtimeTranscription(
          session.id,
          stream,
          (segment) => {
            setSegments((current) => [...current, segment]);
            setLiveTranscript("");
            liveTranscriptRef.current = "";
          },
          (delta) => {
            liveTranscriptRef.current += delta.text;
            setLiveTranscript(liveTranscriptRef.current);
          },
        );
        setConnectionNote("실시간 전사가 연결되었습니다. 말하는 내용이 아래에 바로 표시됩니다.");
      } catch {
        setConnectionNote("실시간 전사를 연결하지 못했습니다. 녹음은 계속되며 종료 후 전사문을 입력할 수 있습니다.");
      }
    } catch (caught) {
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      setPreparing(false);
      onError(caught instanceof Error ? caught.message : "마이크를 시작하지 못했습니다.");
    }
  }

  async function stop() {
    if (timer.current) window.clearInterval(timer.current);
    mediaRecorder.current?.stop();
    setRecording(false);
    setRecorded(true);
    await realtime.current?.stop().catch(() => undefined);
    if (liveTranscriptRef.current.trim()) {
      const partial = liveTranscriptRef.current.trim();
      setSegments((current) => current.length ? current : [{ text: partial, source: "realtime" }]);
    }
    mediaStream.current?.getTracks().forEach((track) => track.stop());
  }

  async function finalize() {
    onError("");
    if (previewMode) {
      await onReady();
      return;
    }
    try {
      let finalSegments = [...segments];
      if (!finalSegments.length && manualTranscript.trim()) {
        finalSegments.push({ text: manualTranscript.trim(), source: "manual" });
      }
      if (audioBlob.current?.size) await api.uploadAudio(session.id, audioBlob.current);
      if (finalSegments.length) {
        await api.submitTranscript(session.id, finalSegments);
      } else {
        const recovered = await api.recoverTranscript(session.id);
        finalSegments = recovered.transcript_segments;
      }
      if (!finalSegments.length) throw new Error("전사문을 복구하지 못했습니다. 녹음에서 말한 내용을 직접 입력해 주세요.");
      await api.completeRecording(session.id);
      await onReady();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "풀이 기록을 확정하지 못했습니다.");
    }
  }

  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <section className="work-surface problem-surface">
      <div className="surface-heading">
        <div><p className="step-kicker">2단계 · 문제 풀이</p><h1>{problem.title}</h1></div>
        <span className={recording ? "recording-pill live" : "recording-pill"}><i />{recording ? `녹음 중 ${time}` : preparing ? "준비 중" : "대기 중"}</span>
      </div>
      <div className="problem-sheet">
        <div className="problem-copy"><MathText text={problem.stem_math || problem.stem} /></div>
        <figure className="problem-figure">
          <Image src={problem.image_path} alt={problem.image_alt} width={2400} height={2400} sizes="(max-width: 900px) 80vw, 360px" priority />
          <figcaption>원탁에서는 마지막 학생과 첫 학생도 서로 이웃합니다.</figcaption>
        </figure>
      </div>
      <div className="think-aloud-guide">
        <strong>생각나는 내용을 그대로 소리 내어 말해 주세요.</strong>
        <p>막힌 순간, 계산을 확인한 이유, 방법을 바꾼 까닭도 모두 중요한 자료입니다. 설명하려 애쓰기보다 지금 떠오르는 생각을 말하면 됩니다.</p>
      </div>
      <div className="recorder-console">
        {recording && <div className="recording-ready" role="status" aria-live="assertive">녹음이 시작되었습니다. 지금부터 말씀해 주세요.</div>}
        <div className="signal" aria-hidden="true">{Array.from({ length: 19 }).map((_, index) => <span key={index} />)}</div>
        <div className="recorder-status">
          <p>{connectionNote}</p>
          {(recording || liveTranscript) && (
            <div className="live-transcript" aria-live="polite">
              <span>실시간 전사</span>
              <strong>{liveTranscript || "말씀해 주세요…"}</strong>
            </div>
          )}
        </div>
        {!recording && !recorded && <button className="record-button" onClick={start} disabled={preparing}><span />{preparing ? "녹음 준비 중…" : "녹음 준비 완료"}</button>}
        {recording && <button className="record-button stop" onClick={stop}><span />풀이 완료</button>}
      </div>
      {recorded && (
        <div className="transcript-fallback">
          <div>
            <h2>풀이 기록을 확정합니다.</h2>
            <p>{segments.length ? `실시간 전사 ${segments.length}개 구간을 받았습니다.` : "실시간 전사 자료가 없어 아래에 풀이 내용을 입력해 주세요."}</p>
          </div>
          {segments.length > 0 && <div className="completed-transcript">{segments.map((segment) => segment.text).join(" ")}</div>}
          {!segments.length && (
            <textarea value={manualTranscript} onChange={(event) => setManualTranscript(event.target.value)} placeholder="녹음에서 말한 풀이 내용을 가능한 그대로 입력하세요." />
          )}
          <button className="primary-button" onClick={finalize}>녹음과 전사 확정하기</button>
        </div>
      )}
    </section>
  );
}

function TransitionPanel({ title, text, action, busy, onClick }: { title: string; text: string; action: string; busy: boolean; onClick: () => void }) {
  return (
    <section className="work-surface transition-surface">
      <div className="transition-glyph" aria-hidden="true">✓</div>
      <h1>{title}</h1><p>{text}</p>
      <button className="primary-button" disabled={busy} onClick={onClick}>{busy ? "처리하는 중…" : action}</button>
    </section>
  );
}

function InterviewPanel({ session, busy, onAnswer }: { session: StudySession; busy: boolean; onAnswer: (questionId: string, text: string) => void }) {
  const [answer, setAnswer] = useState("");
  const question = session.questions[session.current_question_index];
  const progress = Math.round(((session.current_question_index + 1) / session.questions.length) * 100);
  const logEnd = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [session.interview_turns.length]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim() || !question) return;
    onAnswer(question.id, answer.trim());
    setAnswer("");
  }

  return (
    <section className="work-surface interview-surface">
      <div className="interview-progress">
        <div><p className="step-kicker">3단계 · 풀이 대화</p><h1>문제를 풀던 생각을 함께 되짚어 봅니다.</h1></div>
        <div className="progress-copy"><span>{session.current_question_index + 1} / {session.questions.length}</span><div><i style={{ width: `${progress}%` }} /></div></div>
      </div>
      <div className="chat-log" aria-live="polite">
        {session.interview_turns.map((turn) => (
          <article key={turn.id} className={`chat-turn ${turn.role}`}>
            <span>{turn.role === "assistant" ? "AI 인터뷰어" : "나"}</span>
            <p>{turn.text}</p>
          </article>
        ))}
        <div ref={logEnd} />
      </div>
      <form className="chat-composer" onSubmit={submit}>
        <label htmlFor="answer">답변</label>
        <textarea id="answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="그때의 상황과 생각을 구체적으로 적어 주세요." />
        <div><small>짧으면 현재 질문에 대한 추가 질문이 이어질 수 있습니다.</small><button className="primary-button" disabled={busy || !answer.trim()}>{busy ? "저장 중…" : "답변 보내기"}</button></div>
      </form>
    </section>
  );
}

function ResultsPanel({ session, surveyItems, busy, onChoose }: { session: StudySession; surveyItems: SurveyItem[]; busy: boolean; onChoose: (choice: string, note: string) => void }) {
  const [choice, setChoice] = useState(session.comparison?.choice ?? "");
  const [note, setNote] = useState(session.comparison?.note ?? "");
  const survey = surveyMeans(session, surveyItems);
  return (
    <section className="work-surface results-surface">
      <div className="surface-heading">
        <div><p className="step-kicker">4단계 · 결과 비교</p><h1>설문과 문제 풀이에서 본 나의 모습</h1></div>
        {session.execution_mode === "demo" && <span className="demo-badge">데모 채점 결과</span>}
      </div>
      <p className="instruction">설문은 평소의 자기인식이고, 문제 풀이 결과는 이번 풀이 기록과 대화에서 드러난 모습입니다. 점수의 높고 낮음보다 두 결과의 차이를 살펴보세요.</p>
      <div className="score-table">
        <div className="score-head"><span>영역</span><span>설문 결과</span><span>문제 풀이 결과</span></div>
        {session.factor_ratings.map((rating) => (
          <div className="score-row" key={rating.factor}>
            <strong>{factorLabels[rating.factor]}</strong>
            <ScoreMark value={survey[rating.factor]} />
            <ScoreMark value={rating.factor_score ?? undefined} coverage={rating.coverage} />
          </div>
        ))}
      </div>
      <div className="item-analysis">
        <h2>문항별 분석</h2>
        <p>역방향 문항을 포함한 10개 문항을 각각 평가한 결과입니다.</p>
        {session.item_ratings.map((rating) => {
          const question = session.questions.find((item) => item.id === rating.question_id);
          return (
            <details key={rating.question_id}>
              <summary><span>{question?.order}. {factorLabels[rating.factor]}{rating.question_direction === "reverse" ? " · 역방향" : ""}</span><strong>{rating.score ?? "평가 불가"}</strong></summary>
              <p className="question-text">{question?.text}</p><p>{rating.reason}</p>
            </details>
          );
        })}
      </div>
      <div className="comparison-choice">
        <h2>어느 결과가 지금의 나를 더 잘 설명하나요?</h2>
        <div className="choice-grid">
          {[
            ["survey", "설문 결과"], ["interview", "문제 풀이 결과"], ["both", "둘 다"], ["neither", "둘 다 아님"],
          ].map(([value, label]) => <button key={value} className={choice === value ? "selected" : ""} onClick={() => setChoice(value)}>{label}</button>)}
        </div>
        <label htmlFor="comparison-note">그렇게 생각한 이유 (선택)</label>
        <textarea id="comparison-note" value={note} onChange={(event) => setNote(event.target.value)} />
        <button className="primary-button" disabled={busy || !choice || session.state === "comparison_done"} onClick={() => onChoose(choice, note)}>
          {session.state === "comparison_done" ? "선택이 저장되었습니다" : "선택 저장하기"}
        </button>
      </div>
    </section>
  );
}

function ScoreMark({ value, coverage }: { value?: number; coverage?: string }) {
  if (value === undefined) return <span className="score-missing">평가 불가</span>;
  return <span className="score-mark"><b>{value.toFixed(2)}</b><i style={{ width: `${(value / 5) * 100}%` }} />{coverage === "partial" && <small>일부 문항</small>}</span>;
}

function MathText({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$)/g).filter(Boolean);
  return (
    <p>
      {parts.map((part, index) => {
        if (!part.startsWith("$") || !part.endsWith("$")) return <span key={index}>{part}</span>;
        const html = katex.renderToString(part.slice(1, -1), {
          throwOnError: false,
          strict: "warn",
        });
        return <span className="inline-math" key={index} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </p>
  );
}


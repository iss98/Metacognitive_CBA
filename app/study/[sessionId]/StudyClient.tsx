"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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

        {session.state === "created" && (
          <SurveyPanel
            items={surveyItems}
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
            text="이제 전사문에서 학생이 실제로 말한 풀이 사건을 정리하고, 회고 인터뷰의 기본 질문 17개를 준비합니다."
            action="인터뷰 질문 준비하기"
            busy={busy}
            onClick={() => run(() => api.prepareInterview(sessionId))}
          />
        )}

        {session.state === "questions_ready" && (
          <TransitionPanel
            title="회고 인터뷰를 시작할 준비가 됐습니다."
            text="기본 질문 17개를 모두 순서대로 묻습니다. 한 질문에 답이 부족하면 그 질문에 대해서만 짧은 추가 질문이 나옵니다."
            action="채팅 인터뷰 시작하기"
            busy={busy}
            onClick={() => run(() => api.startInterview(sessionId))}
          />
        )}

        {session.state === "interviewing" && (
          <InterviewPanel session={session} busy={busy} onAnswer={(questionId, text) => run(() => api.answerInterview(sessionId, questionId, text))} />
        )}

        {session.state === "interview_done" && (
          <TransitionPanel
            title="17개 기본 질문을 모두 마쳤습니다."
            text="각 문항의 응답과 관련 전사 근거를 함께 분석해 문항별 점수를 만들고, 같은 factor의 문항 점수를 평균합니다."
            action="진단 결과 만들기"
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

function SurveyPanel({
  items,
  busy,
  onSubmit,
}: {
  items: SurveyItem[];
  busy: boolean;
  onSubmit: (responses: Array<{ item_id: string; score: number }>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const completed = Object.keys(answers).length;
  const grouped = useMemo(() => {
    const result = new Map<Factor, SurveyItem[]>();
    items.forEach((item) => result.set(item.factor, [...(result.get(item.factor) ?? []), item]));
    return [...result.entries()];
  }, [items]);

  return (
    <section className="work-surface survey-surface">
      <div className="surface-heading">
        <div><p className="step-kicker">1단계 · 사전 진단</p><h1>평소의 나와 가까운 정도를 표시해 주세요.</h1></div>
        <p className="completion-count"><strong>{completed}</strong> / {items.length}</p>
      </div>
      <p className="instruction">정답은 없습니다. 오래 고민하기보다 평소의 모습에 가장 가까운 응답을 선택하세요.</p>
      <div className="survey-groups">
        {grouped.map(([factor, factorItems]) => (
          <fieldset key={factor}>
            <legend>{factorLabels[factor]}</legend>
            {factorItems.map((item) => (
              <div className="survey-item" key={item.id}>
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
        ))}
      </div>
      <div className="sticky-action">
        <p>{completed < items.length ? `${items.length - completed}개 문항이 남았습니다.` : "모든 문항에 응답했습니다."}</p>
        <button
          className="primary-button"
          disabled={busy || completed !== items.length}
          onClick={() => onSubmit(items.map((item) => ({ item_id: item.id, score: answers[item.id] })))}
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
}: {
  session: StudySession;
  problem: Problem;
  busy: boolean;
  onSession: (session: StudySession) => void;
  onError: (message: string) => void;
  onReady: () => Promise<void>;
}) {
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [manualTranscript, setManualTranscript] = useState("");
  const [segments, setSegments] = useState<TranscriptSegment[]>(session.transcript_segments ?? []);
  const [connectionNote, setConnectionNote] = useState("마이크를 시작하면 실시간 전사를 연결합니다.");
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const realtime = useRef<{ stop: () => Promise<void> } | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const audioBlob = useRef<Blob | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearInterval(timer.current);
    mediaStream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function start() {
    onError("");
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
      recorder.start(1000);
      mediaRecorder.current = recorder;
      setRecording(true);
      setSeconds(0);
      timer.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
      try {
        realtime.current = await connectRealtimeTranscription(session.id, stream, (segment) => {
          setSegments((current) => [...current, segment]);
        });
        setConnectionNote("실시간 전사가 연결되었습니다. 전사 내용은 풀이 중 표시하지 않습니다.");
      } catch {
        setConnectionNote("실시간 전사를 연결하지 못했습니다. 녹음은 계속되며 종료 후 전사문을 입력할 수 있습니다.");
      }
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "마이크를 시작하지 못했습니다.");
    }
  }

  async function stop() {
    if (timer.current) window.clearInterval(timer.current);
    mediaRecorder.current?.stop();
    setRecording(false);
    setRecorded(true);
    await realtime.current?.stop().catch(() => undefined);
    mediaStream.current?.getTracks().forEach((track) => track.stop());
  }

  async function finalize() {
    onError("");
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
        <div><p className="step-kicker">2단계 · Think-aloud</p><h1>{problem.title}</h1></div>
        <span className={recording ? "recording-pill live" : "recording-pill"}><i />{recording ? `녹음 중 ${time}` : "대기 중"}</span>
      </div>
      <div className="problem-sheet">
        <p>{problem.stem}</p>
      </div>
      <div className="think-aloud-guide">
        <strong>생각나는 내용을 그대로 소리 내어 말해 주세요.</strong>
        <p>막힌 순간, 계산을 확인한 이유, 방법을 바꾼 까닭도 모두 중요한 자료입니다. 설명하려 애쓰기보다 지금 떠오르는 생각을 말하면 됩니다.</p>
      </div>
      <div className="recorder-console">
        <div className="signal" aria-hidden="true">{Array.from({ length: 19 }).map((_, index) => <span key={index} />)}</div>
        <p>{connectionNote}</p>
        {!recording && !recorded && <button className="record-button" onClick={start}><span />녹음 시작</button>}
        {recording && <button className="record-button stop" onClick={stop}><span />풀이 완료</button>}
      </div>
      {recorded && (
        <div className="transcript-fallback">
          <div>
            <h2>풀이 기록을 확정합니다.</h2>
            <p>{segments.length ? `실시간 전사 ${segments.length}개 구간을 받았습니다.` : "실시간 전사 자료가 없어 아래에 풀이 내용을 입력해 주세요."}</p>
          </div>
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
  const turns = session.interview_turns.filter((turn) => turn.question_id === question?.id);
  const progress = Math.round(((session.current_question_index + 1) / session.questions.length) * 100);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim() || !question) return;
    onAnswer(question.id, answer.trim());
    setAnswer("");
  }

  return (
    <section className="work-surface interview-surface">
      <div className="interview-progress">
        <div><p className="step-kicker">3단계 · 회고 인터뷰</p><h1>{session.current_question_index + 1}번째 질문</h1></div>
        <div className="progress-copy"><span>{session.current_question_index + 1} / {session.questions.length}</span><div><i style={{ width: `${progress}%` }} /></div></div>
      </div>
      <p className="factor-context">이번 질문은 <strong>{factorLabels[question.factor]}</strong>에 관한 경험을 묻습니다.</p>
      <div className="chat-log" aria-live="polite">
        {turns.map((turn) => (
          <article key={turn.id} className={`chat-turn ${turn.role}`}>
            <span>{turn.role === "assistant" ? "AI 인터뷰어" : "나"}</span>
            <p>{turn.text}</p>
          </article>
        ))}
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
        <div><p className="step-kicker">4단계 · 결과 비교</p><h1>두 시선으로 본 나의 학습 과정</h1></div>
        {session.execution_mode === "demo" && <span className="demo-badge">데모 채점 결과</span>}
      </div>
      <p className="instruction">설문은 평소의 자기인식이고, 회고 진단은 이번 문제의 답변과 풀이 기록에서 드러난 모습입니다. 점수의 높고 낮음보다 두 결과의 차이를 살펴보세요.</p>
      <div className="score-table">
        <div className="score-head"><span>영역</span><span>사전 설문</span><span>회고 진단</span></div>
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
        <p>역방향 문항을 포함한 17개 문항을 각각 평가한 결과입니다.</p>
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
            ["survey", "사전 설문"], ["interview", "회고 진단"], ["both", "둘 다"], ["neither", "둘 다 아님"],
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


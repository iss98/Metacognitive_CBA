import type { SessionState } from "@/lib/types";

const stages = [
  { label: "음성 확인", states: ["audio_check"] },
  { label: "설문", states: ["created"] },
  { label: "문제 풀이", states: ["survey_done", "recording", "transcript_ready", "schema_ready"] },
  { label: "풀이 대화", states: ["questions_ready", "interviewing", "interview_done", "rating"] },
  { label: "결과 비교", states: ["results_ready", "comparison_done"] },
];

export function StageRail({ state }: { state: SessionState }) {
  const current = Math.max(0, stages.findIndex((stage) => stage.states.includes(state)));
  return (
    <aside className="stage-rail" aria-label="실험 진행 단계">
      <div className="brand-mark" aria-hidden="true">결</div>
      <ol>
        {stages.map((stage, index) => (
          <li key={stage.label} className={index === current ? "current" : index < current ? "done" : ""}>
            <span className="stage-dot" aria-hidden="true" />
            <span className="stage-number">{index + 1}</span>
            <span>{stage.label}</span>
          </li>
        ))}
      </ol>
      <p className="rail-note">설문에 답하고 문제를 푼 뒤<br />그 과정을 대화로 돌아봅니다.</p>
    </aside>
  );
}


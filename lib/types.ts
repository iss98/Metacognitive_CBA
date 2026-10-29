export type SessionState =
  | "created"
  | "survey_done"
  | "recording"
  | "transcript_ready"
  | "schema_ready"
  | "questions_ready"
  | "interviewing"
  | "interview_done"
  | "rating"
  | "results_ready"
  | "comparison_done";

export type Factor =
  | "planning"
  | "monitoring"
  | "debugging"
  | "evaluation"
  | "declarative_knowledge"
  | "procedural_knowledge"
  | "conditional_knowledge";

export const factorLabels: Record<Factor, string> = {
  planning: "계획",
  monitoring: "점검",
  debugging: "수정 전략",
  evaluation: "평가",
  declarative_knowledge: "선언적 지식",
  procedural_knowledge: "절차적 지식",
  conditional_knowledge: "조건적 지식",
};

export interface SurveyItem {
  id: string;
  factor: Factor;
  text: string;
  highlighted_for_interview: boolean;
}

export interface TranscriptSegment {
  id?: string;
  item_id?: string;
  order?: number;
  text: string;
  source: "realtime" | "file_recovery" | "manual";
}

export interface InterviewQuestion {
  id: string;
  order: number;
  factor: Factor;
  text: string;
  direction: "direct" | "reverse";
  intent: string;
  status: "pending" | "active" | "answered";
  followup_count: number;
}

export interface InterviewTurn {
  id: string;
  question_id: string;
  role: "assistant" | "student";
  text: string;
  kind: "base_question" | "followup" | "answer";
}

export interface ItemRating {
  question_id: string;
  factor: Factor;
  question_direction: "direct" | "reverse";
  score: number | null;
  status: "rated" | "unable_to_rate";
  reason: string;
  evidence_alignment: string;
  response_consistency: string;
}

export interface FactorRating {
  factor: Factor;
  item_scores: Array<{ question_id: string; score: number | null }>;
  factor_score: number | null;
  rated_item_count: number;
  total_item_count: number;
  coverage: "complete" | "partial" | "insufficient";
}

export interface StudySession {
  id: string;
  participant_code: string;
  state: SessionState;
  survey_responses: Array<{ item_id: string; score: number }>;
  transcript_segments: TranscriptSegment[];
  questions: InterviewQuestion[];
  interview_turns: InterviewTurn[];
  current_question_index: number;
  item_ratings: ItemRating[];
  factor_ratings: FactorRating[];
  comparison?: { choice: string; note: string } | null;
  execution_mode: "demo" | "model";
}

export interface Problem {
  id: string;
  title: string;
  stem: string;
}


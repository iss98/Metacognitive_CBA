import type { Factor, StudySession, SurveyItem } from "./types";

export function surveyMeans(session: StudySession, items: SurveyItem[]): Partial<Record<Factor, number>> {
  const scores = new Map(session.survey_responses.map((item) => [item.item_id, item.score]));
  const grouped = new Map<Factor, number[]>();
  items.forEach((item) => {
    const score = scores.get(item.id);
    if (score === undefined) return;
    grouped.set(item.factor, [...(grouped.get(item.factor) ?? []), score]);
  });
  return Object.fromEntries(
    [...grouped.entries()].map(([factor, values]) => [
      factor,
      Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)),
    ]),
  );
}


import { describe, expect, it } from "vitest";
import { surveyMeans } from "./scores";
import type { StudySession, SurveyItem } from "./types";

describe("surveyMeans", () => {
  it("averages item scores by factor", () => {
    const items = [
      { id: "p1", factor: "planning", text: "a", highlighted_for_interview: false },
      { id: "p2", factor: "planning", text: "b", highlighted_for_interview: false },
    ] satisfies SurveyItem[];
    const session = {
      survey_responses: [
        { item_id: "p1", score: 2 },
        { item_id: "p2", score: 4 },
      ],
    } as StudySession;
    expect(surveyMeans(session, items).planning).toBe(3);
  });
});


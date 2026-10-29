import { StudyClient } from "./StudyClient";

export default async function StudyPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <StudyClient sessionId={sessionId} />;
}


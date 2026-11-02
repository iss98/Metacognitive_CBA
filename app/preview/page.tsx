import { notFound } from "next/navigation";
import { TestPreviewClient } from "@/app/study/[sessionId]/StudyClient";

export default function PreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <TestPreviewClient />;
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { StatusMessage } from "@/components/StatusMessage";

export default function ResearchPage() {
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof api.listSessions>>>([]);
  const [error, setError] = useState("");
  useEffect(() => { api.listSessions().then(setSessions).catch((caught) => setError(caught.message)); }, []);
  return (
    <main className="research-page">
      <header><div><Link href="/" className="wordmark">생각의 결</Link><h1>연구 진행 현황</h1></div><p>로컬 MVP에서는 최근 100개 세션을 표시합니다.</p></header>
      {error && <StatusMessage error={error} />}
      <div className="session-list">
        <div className="session-list-head"><span>참가 코드</span><span>현재 단계</span><span>실행 방식</span><span>최근 저장</span></div>
        {sessions.map((session) => (
          <a href={`/study/${session.id}`} key={session.id}>
            <strong>{session.participant_code}</strong><span>{session.state}</span><span>{session.execution_mode === "demo" ? "데모" : "모델"}</span><time>{new Date(session.updated_at).toLocaleString("ko-KR")}</time>
          </a>
        ))}
        {!sessions.length && !error && <p className="empty-list">아직 시작된 실험이 없습니다.</p>}
      </div>
    </main>
  );
}


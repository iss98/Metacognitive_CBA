"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { StatusMessage } from "@/components/StatusMessage";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError("");
    try {
      const session = await api.createSession(code.trim());
      router.push(`/study/${session.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "세션을 시작하지 못했습니다.");
      setBusy(false);
    }
  }

  return (
    <main className="landing">
      <section className="landing-copy">
        <div className="landing-symbol" aria-hidden="true">
          <span>생각</span><span>풀이</span><span>회고</span>
        </div>
        <p className="product-name">생각의 결</p>
        <h1>수학을 푼 답보다,<br />풀어 가는 생각을 봅니다.</h1>
        <p className="lede">
          한 문제를 풀며 생각을 소리 내어 말하고, 풀이가 끝난 뒤 AI와 차분히 되짚어 봅니다.
          설문 응답과 실제 문제 풀이에서 드러난 모습을 함께 살펴보는 연구 도구입니다.
        </p>
        <dl className="study-facts">
          <div><dt>예상 시간</dt><dd>25–35분</dd></div>
          <div><dt>준비물</dt><dd>마이크, 조용한 공간</dd></div>
          <div><dt>진행</dt><dd>음성 확인 · 설문 · 풀이 · 대화</dd></div>
        </dl>
      </section>

      <section className="entry-panel" aria-labelledby="entry-title">
        <div>
          <p className="step-kicker">실험 시작</p>
          <h2 id="entry-title">연구자가 안내한 참가 코드를 입력하세요.</h2>
          <p>코드는 이름 대신 실험 기록을 연결하는 데 사용됩니다.</p>
        </div>
        <form onSubmit={start}>
          <label htmlFor="participant-code">참가 코드</label>
          <input
            id="participant-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="예: P-024"
            autoComplete="off"
          />
          <button className="primary-button" disabled={busy || !code.trim()}>
            {busy ? "실험을 준비하는 중…" : "실험 시작하기"}
          </button>
        </form>
        <StatusMessage error={error} />
        <a className="research-link" href="/research">연구자용 진행 현황 보기</a>
      </section>
    </main>
  );
}


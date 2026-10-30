import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "생각의 결 | 수학 문제 풀이 연구",
  description: "설문과 수학 문제 풀이, 풀이 대화를 함께 진행하는 연구 도구입니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}


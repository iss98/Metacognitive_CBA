import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "생각의 결 | 수학 메타인지 진단",
  description: "수학 문제 풀이와 회고 인터뷰를 통해 자신의 사고 과정을 살펴봅니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}


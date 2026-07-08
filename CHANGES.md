# 변경 내역 (Changelog)

Chennai Fleet TCO Simulator — 세션 작업 요약
**작업일:** 2026-07-08 · **배포:** https://yscom97.github.io/chennai-fleet-tco-simulator/

---

## 1. API 제거 및 자립형 전환

Google Gemini API 의존성을 완전히 제거하고, 동일한 3섹션 리포트를 규칙 기반으로 재현.

| 구분 | 변경 |
|---|---|
| 삭제 | `services/gemini.ts` (Gemini API 호출) |
| 신규 | `services/analysis.ts` — 규칙 기반 어드바이저 (Verdict / Risk / Action Plan) |
| 수정 | `App.tsx` — `getAIAnalysis` → `generateAnalysis` (동기), 로딩 상태·`process.env` 제거 |
| 정리 | `package.json`에서 `@google/genai` 제거, `index.html` importmap·깨진 CSS 링크 제거, `vite.config.ts`에서 API 키 주입 제거 |
| 삭제 | `.env.local` (불필요) |

> **결과:** API 키·네트워크·백엔드 없이 브라우저에서 100% 로컬 동작.

---

## 2. GitHub Pages 배포 자동화

- **`.github/workflows/deploy.yml`** 추가 — `main` 푸시 시 자동 빌드·배포
- `vite.config.ts`에 `base: './'` (상대 경로) 설정 → 하위 경로 배포 대응
- GitHub CLI(`gh`) 설치·인증, 저장소 생성·푸시, Pages 소스를 GitHub Actions로 설정
- 워크플로우 액션 최신화: `checkout@v7`, `setup-node@v6` (Node 22), `upload-pages-artifact@v5`, `deploy-pages@v5`

---

## 3. 벤치마크 리서치 반영 (인사이트 → 코드)

ICCT · NREL T3CO · eFAST India · Geotab · Fynd 및 Monte Carlo/NPV 논문 분석 결과를 엔진에 반영.

| 인사이트 (출처) | 반영 내용 |
|---|---|
| 수명주기 NPV (T3CO/ICCT) | 할인율·보유기간 기반 현재가치, 디젤·급여 인플레이션 복리 반영 |
| 잔존가치·감가상각 (Fynd) | 미사용이던 `residualValue` 연결 → 월 감가상각 산출 |
| 가동률·다운타임 (T3CO/Geotab) | 미사용이던 `availabilityPercent` 연결 → 다운타임 시장 백필 비용화 |
| 확률적 리스크 (Monte Carlo 논문) | 1,000회 시뮬레이션 → 수익 확률·P10/P50/P90 |
| 벤치마크 밴드 (Geotab) | 원가/km, 연료비중 "정상 범위" 판정 |
| EV vs 디젤 + CO₂ (eFAST India) | 전기 수명주기 NPV 비교 + 인도 그리드 CO₂ |

---

## 4. 추가 기능

- **수명주기 NPV 엔진** — `calculateTCO`에 할인 현금흐름·잔존가치 회수·에스컬레이션 통합
- **Monte Carlo** (`runMonteCarlo`) — 수익 확률, 백분위, 히스토그램
- **토네이도 민감도** (`runSensitivity`) — 비용 드라이버 임팩트 순위 (±15%)
- **EV 비교** (`calculateEv`) — 배터리 교체·그리드 CO₂ 포함 전기 NPV
- **시나리오 저장·비교** (`services/scenarios.ts`, localStorage) — 최대 6개 나란히 비교
- **CSV 내보내기** · **공유 URL** (파라미터 인코딩) · **다크 모드**
- 어드바이저 강화 — NPV·CO₂ 인사이트를 Verdict/Risk에 반영

---

## 5. UI/UX 개선

- **파이차트 매직넘버 버그 제거** — 하드코딩 `- 25` 삭제, 9개 항목 정확 분해 (합 100%)
- **Tailwind CDN → PostCSS 빌드** 전환 — 프로덕션 경고 해소, 오프라인 대응
  - 추가: `tailwind.config.js`, `postcss.config.js`, `index.css`
- **슬라이더 + 툴팁** — 주요 드라이버 입력에 range 슬라이더·설명 아이콘
- **Rate Basis 셀렉터** + 톤수 입력 — 하드코딩 20T 제거
- **손익분기 기준선** (BEP ReferenceLine) 차트에 표시
- **Lakh/Crore 표기** (`formatCompact`) — 인도식 대금액 포맷
- **입력 검증** (min/max), **반응형 헤더**, **접근성** (aria 라벨)
- **차트 애니메이션 비활성화** (`isAnimationActive={false}`) — 렌더 신뢰성 확보

---

## 6. 검증

- `tsc --noEmit` 통과, `npm run build` 성공
- Chrome 브라우저 실측: 콘솔 에러 0건, 전 차트(라인/도넛/토네이도/히스토그램/EV) 정상 렌더, 다크모드·어드바이저·EV 토글·시나리오 동작 확인
- 라이브 사이트 HTTP 200, 컴파일 CSS 탑재·CDN 0건 확인

---

## 파일 변경 요약

**신규:** `services/analysis.ts`, `services/scenarios.ts`, `.github/workflows/deploy.yml`, `tailwind.config.js`, `postcss.config.js`, `index.css`, `CHANGES.md`
**대폭 수정:** `App.tsx`, `services/calculations.ts`, `types.ts`
**소폭 수정:** `index.html`, `index.tsx`, `vite.config.ts`, `package.json`, `README.md`
**삭제:** `services/gemini.ts`, `.env.local`

## 유지된 강점

첸나이 특화 세분화(항구 TAT 공회전·Bhatta 일당·FASTag·AdBlue)는 상용 도구보다 세밀한 차별화 자산으로 그대로 보존.

## 향후 후보 (미반영)

이종 다차종 플릿 지원 — ROI 대비 비용이 커 이번 범위에서 제외.

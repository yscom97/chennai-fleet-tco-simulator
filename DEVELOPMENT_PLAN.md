# 개발 계획서 (통합)

Chennai Fleet TCO Simulator — 다음 단계 고도화 로드맵
**기준일:** 2026-07-08
**근거 문서:** `improvement_recommendations.md`, `development_plan.md` (Antigravity CLI 생성) + 현재 코드베이스 실측

---

## 0. 검토 요약 — 문서 vs 현재 코드 상태

두 참고 문서는 이전 버전 기준으로 작성되어, 이번 세션에서 이미 반영된 항목이 일부 포함되어 있습니다.
아래는 각 제안의 **실제 현재 상태**입니다.

| 제안 항목 | 출처 | 현재 상태 | 비고 |
|---|---|:---:|---|
| EV vs 디젤 수명주기 NPV | rec §1 | ✅ 완료 | `calculateEv` 구현됨 |
| CO₂ 배출 비교 | rec §1 | ✅ 완료 | 그리드 CO₂ 반영 |
| Monte Carlo 리스크 | plan §B3 | ✅ 완료 | 단, 변수 독립 샘플링 |
| 토네이도 민감도 | — | ✅ 완료 | ±15% swing |
| 잔존가치·감가상각 | — | ✅ 완료 | 정액법 (straight-line) |
| **충전기 CAPEX** (`chargerCost`) | rec §1 | ❌ 신규 | EV 초기투자 과소평가 |
| **배터리 적재 페널티** (`payloadPenaltyTons`) | rec §1 | ❌ 신규 | Ton 기준에서 매출 손실 |
| **EV 가동률 계수** (기회충전) | rec §1 | ❌ 신규 | 충전 다운타임 |
| **비선형 정비 노화 곡선** | rec §2 | ❌ 신규 | 현재 km당 정비비 고정 |
| **WDV 세법 감가상각 + 절세** | rec §2 | ❌ 신규 | 인도 소득세법 |
| **상관관계 Monte Carlo** (유가↔운임) | rec §3 | ❌ 신규 | 현재 독립 샘플링 |
| **P10–P90 신뢰 밴드 시각화** | rec §3 | ❌ 신규 | 현재 단일 Own/Market 선 |
| **첸나이 노선 프리셋** | rec §4 | ❌ 신규 | 저데이터 UX |
| **다차종 혼합 플릿** | rec §4 | ⏸ 보류 | 구조 변경 大 |

> **결론:** 참고 문서의 4대 영역 중 EV·Monte Carlo의 *기반*은 완성. 남은 것은 **현실 정밀도를 한 단계 높이는 정밀화 작업**입니다.

---

## 1. 우선순위 매트릭스 (임팩트 × 난이도)

| 항목 | 임팩트 | 난이도 | 우선순위 |
|---|:---:|:---:|:---:|
| 충전기 CAPEX + EV 가동률 계수 | 높음 | 낮음 | **P1** |
| 비선형 정비 노화 곡선 | 높음 | 중간 | **P1** |
| P10–P90 신뢰 밴드 시각화 | 높음 | 중간 | **P2** |
| 상관관계 Monte Carlo | 중간 | 낮음 | **P2** |
| WDV 세법 감가상각 + 절세 | 높음 | 중간 | **P3** |
| 배터리 적재 페널티 | 중간 | 낮음 | **P3** |
| 첸나이 노선 프리셋 | 중간 | 낮음 | **P3** |
| 다차종 혼합 플릿 | 높음 | 매우 높음 | **P4 (별도 트랙)** |

---

## 2. 단계별 개발 계획

### 📅 Phase 1 — 전기화 현실화 + 정비 노화 (핵심 정밀도)
**목표:** EV 초기투자·운영 현실 반영, 수명주기 정비비 왜곡 제거

**작업**
1. `types.ts` — `EvParams`에 `chargerCost`, `evAvailabilityMultiplier`, `payloadPenaltyTons` 추가.
   전역 `finance`에 `maintenanceAgingPct`(연간 정비비 상승률) 추가.
2. `services/calculations.ts`
   - `calculateEv`: 충전기 비용을 EV 다운페이/원금에 포함, `evAvailabilityMultiplier`로 유효 가동률 조정.
   - `computeMonthly` NPV 루프: 경과 연수 기반 **비선형 정비·타이어 노화 계수** 적용
     — `agingFactor = (1 + maintenanceAgingPct/100)^yearsElapsed`.
3. `App.tsx` — 사이드바 EV 섹션에 신규 입력(충전기 비용, 가동률 계수), Fuel & Variable에 정비 노화율 슬라이더.

**산출물:** EV TCO가 충전 인프라·다운타임을 반영, 디젤 NPV가 노후 정비비 상승을 반영.
**예상:** 반나절

---

### 📅 Phase 2 — 확률 모델 정밀화 + 신뢰 밴드 시각화
**목표:** 일변량→상관 확률 모델, 손익분기 차트에 불확실성 밴드

**작업**
1. `services/calculations.ts`
   - `runMonteCarlo`: 유가 표본에 연동해 시장 운임(`unitRate`)이 **양의 상관(예: 0.7)** 으로 동반 변동하도록 공분산 구조 주입.
   - 신규 `runConfidenceBand(params)`: 회전율 10~40 구간 각 지점마다 소규모 Monte Carlo → 자체운영/시장 비용의 **P10/P50/P90** 반환.
2. `App.tsx` — 손익분기 차트에 Recharts `<Area>`(반투명)로 P10~P90 밴드 오버레이, 중앙값 선 유지.
   `types.ts`에 `ConfidencePoint` 타입 추가.

**산출물:** "회전율이 흔들릴 때 손익이 어느 범위에 놓이는가"를 한눈에.
**예상:** 1일

---

### 📅 Phase 3 — 세법 절세 + 적재 페널티 + 노선 프리셋
**목표:** 인도 세제 현실 반영, Ton 기준 EV 손실, 저데이터 UX

**작업**
1. `types.ts`/`calculations.ts` — **WDV 감가상각** 옵션: `corporateTaxRatePct` 입력, 디젤 30%·EV 40% WDV율 적용, 감가상각 절세액(tax shield)을 NPV에 반영. *(전제: 과세소득 존재 — UI에 가정 명시)*
2. `calculateEv` — `unitType === 'Ton'`일 때 `payloadPenaltyTons`만큼 톤당 매출 차감.
3. `App.tsx` — **첸나이 노선 프리셋** 드롭다운("항만 왕복 셔틀", "백갈루루 장거리" 등) → 클릭 시 파라미터 세트 로드. `services/scenarios.ts`에 프리셋 상수 정의.

**산출물:** 세후 실질 TCO, EV 적재 트레이드오프, 신규 사용자 온보딩 개선.
**예상:** 1일

---

### 📅 Phase 4 — (별도 트랙) 다차종 혼합 플릿
**목표:** "25톤 5대 + 40톤 3대" 같은 이종 구성 지원

**성격:** `capex`/`opexVariable`를 단일 객체 → **차량 프로파일 배열**로 전환하는 구조 변경. 모든 연산·차트가 집계 로직을 타야 하므로 영향 범위 큼.
**권장:** Phase 1~3 안정화 후 독립 브랜치에서 진행. 데이터 모델부터 점진 마이그레이션.
**예상:** 2~3일

---

### 📅 Phase 5 — 검증 & 배포 (매 Phase 공통)
1. `npx tsc --noEmit` 타입 검증
2. `npm run build` 빌드 검사
3. Chrome 실측 — 차트 렌더·콘솔 에러·다크모드 회귀 확인 (이번 세션에서 발견한 Recharts 애니메이션 이슈처럼 실측 필수)
4. `main` 푸시 → GitHub Actions 자동 배포 → 라이브 HTTP 200 확인

---

## 3. 결정이 필요한 사항 (사용자 확인)

1. **WDV 절세 모델** — 세율 기본값(예: 법인세 25%)과 "과세소득 충분" 전제를 둬도 되는지, 아니면 절세 효과를 옵션 토글로 둘지.
2. **다차종 플릿** — 이번 로드맵에 포함할지(구조 변경 큼), 아니면 별도 트랙으로 미룰지.
3. **노선 프리셋 데이터** — 실제 첸나이 노선/요율 데이터가 있으면 정확도가 크게 오릅니다. 없으면 대표값으로 구성.
4. **진행 방식** — Phase 단위로 구현→배포→리뷰 반복(권장) vs 여러 Phase 일괄.

---

## 4. 참고 문서 원문 위치
- `~/.gemini/antigravity-cli/brain/a6ac1cc1-.../improvement_recommendations.md`
- `~/.gemini/antigravity-cli/brain/a6ac1cc1-.../development_plan.md`

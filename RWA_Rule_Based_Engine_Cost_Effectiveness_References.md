# 특정 도메인에서 룰베이스 엔진이 LLM보다 경제적일 수 있다는 근거

**대상:** 현재 개발 중인 RWA 질의·분석용 결정론적 룰베이스 엔진  
**작성 및 원문 확인일:** 2026년 9월 24일  
**목적:** 사내 설명과 프로젝트 논의에 활용할 주요 자료, 원문 링크 및 적용 논리 정리

## 핵심 요약

**업무 범위와 처리 규칙이 명확한 특정 도메인에서는, 범용 LLM 대신 결정론적 룰베이스 엔진을 사용하는 것이 더 경제적일 수 있다.** Gartner는 규칙·휴리스틱 등을 생성형 AI의 대안으로 제시하고, 단순한 대안이 비용·위험·이해 가능성 측면에서 유리할 수 있다고 설명한다. [출처: Gartner 아티클][gartner-article]

다만 **“특정 업무에서는 더 경제적일 수 있다”는 설계 근거**와 **“우리 엔진이 LLM보다 몇 % 저렴하다”는 실측 증거**는 구분해야 한다. 이 문서의 자료들은 전자를 뒷받침한다. 현재 RWA 엔진의 정확도나 비용 절감률을 직접 검증한 연구는 아니다.

## 주요 링크 한눈에 보기

| 자료 | 주요 활용 목적 | 원문 링크 |
|---|---|---|
| Gartner — When Not to Use Generative AI | 규칙 기반 대안과 비용 효율성을 직접 언급하는 근거 | [아티클 열기][gartner-article] |
| Chip Huyen — Common pitfalls when building generative AI applications | 생성형 AI가 필요하지 않은 문제에 생성형 AI를 적용하는 실수 | [블로그 원문 열기][chip-huyen] |
| OpenAI — A practical guide to building agents | 결정론적 해결책으로 충분한 경우가 있다는 공식 가이드 | [공식 PDF 열기 — 6페이지][openai-pdf] |
| Google — Rules of Machine Learning: Best Practices for ML Engineering | ML 없이 시작하는 원칙과 규칙 복잡성의 한계 | [공식 문서 열기][google-rules] |
| Gartner — 기업용 생성형 AI 가이드 | 토큰 요금 외의 총소유비용을 고려해야 한다는 보조 근거 | [TCO 관련 원문 열기][gartner-tco] |

---

## 1. Gartner: 가장 직접적인 비용 효율성 근거

**자료:** When Not to Use Generative AI  
**저자·날짜:** Leinar Ramos · 2026년 1월 28일  
**관련 부분:** “Consider alternative AI techniques”  
**원문:** [Gartner 아티클][gartner-article]

### 원문 핵심

Gartner는 생성형 AI의 대안으로 비생성형 머신러닝, 최적화, 시뮬레이션, 규칙·휴리스틱, 지식 그래프 등을 제시한다. 단순한 대안을 먼저 검토할 이유를 다음과 같이 설명한다.

> “often less risky, less expensive and easier to understand.”

의미: 위험이 더 작고, 비용이 더 적으며, 이해하기 쉬운 경우가 많다는 것이다. 정확한 계산이나 신뢰할 수 있는 출력이 중요한 경우에도 생성형 AI가 주된 해결 수단으로 적합하지 않을 수 있다고 설명한다. [출처][gartner-article]

### RWA 프로젝트에 적용한 해석

RWA 조회, 순위, 기간 비교, 변동요인 분석처럼 지원할 업무와 계산 방식이 정해져 있다면, **범용 LLM을 도입하기 전에 더 단순한 결정론적 대안의 경제성을 검토한다**는 논리를 뒷받침하기 좋다.

### 인용 시 주의점

같은 글은 대화형 사용자 인터페이스를 생성형 AI가 유용한 영역으로 분류하며, 다른 기술과의 결합도 제시한다. 따라서 “Gartner가 모든 챗봇에서 룰베이스가 더 낫다고 했다”는 해석은 부정확하다. [출처][gartner-article]

우리 프로젝트에서의 적합성은 **자연어 입력을 지원한다는 사실 자체가 아니라, 실제 질의 범위를 규칙으로 충분히 처리할 수 있는지**에 달려 있다. Gartner가 우리 파서의 성능이나 절감률을 검증한 것은 아니다.

## 2. Chip Huyen: 생성형 AI가 필요하지 않은 문제에 사용하는 실수

**자료:** Common pitfalls when building generative AI applications  
**저자·날짜:** Chip Huyen · 2025년 1월 16일  
**관련 부분:** 첫 번째 실수 — 생성형 AI가 필요하지 않은 곳에 사용하는 것  
**원문:** [Chip Huyen 블로그][chip-huyen]

### 원문 핵심

저자는 전력 사용 활동과 시간대별 전기요금을 LLM에 넣어 비용 최소화 일정을 만드는 팀의 사례를 소개한다. 전기가 저렴한 시간에 활동을 배치하는 단순한 방법과 먼저 비교했는지 질문하고, 선형계획법 같은 대안에 대해 다음과 같이 설명한다.

> “much cheaper and more reliable optimization solutions than generative AI”

의미: 생성형 AI보다 훨씬 저렴하고 신뢰할 수 있는 최적화 방법들이 있다는 것이다. 다만 해당 사례에서 LLM과 대안의 정량 비교 결과를 제시한 것은 아니다. [출처][chip-huyen]

### RWA 프로젝트에 적용한 해석

**자연어 질문을 받는다고 해서 모든 처리에 LLM이 필요한 것은 아니다.** 질문 해석, 데이터 조회, 계산, 결과 설명을 나누고, 명확히 정의된 기능에는 목적에 맞는 알고리즘을 사용하는 설계 논리에 도움이 된다.

### 인용 시 주의점

선형계획법은 우리의 룰베이스 자연어 엔진과 같은 기술이 아니다. 이 글은 **비생성형·전통적 알고리즘이 특정 문제에서 더 경제적일 수 있다는 실무적 근거**이지, 룰베이스 자연어 파서의 우월성을 입증한 연구는 아니다.

## 3. OpenAI: 결정론적 해결책으로 충분한 경우를 명시

**자료:** A practical guide to building agents  
**발행기관:** OpenAI  
**관련 위치:** PDF 6페이지  
**원문:** [공식 PDF][openai-pdf] · [공식 안내 페이지][openai-page]

### 원문 핵심

OpenAI는 에이전트 도입을 검토할 대상으로 복잡한 판단이 필요한 업무, 규칙이 지나치게 복잡해 유지하기 어려운 시스템, 비정형 데이터 해석 의존도가 높은 업무를 제시한다. 그러한 조건에 해당하는지 먼저 확인하라고 하며 다음과 같이 적는다.

> “Otherwise, a deterministic solution may suffice.”

의미: 그렇지 않다면 결정론적 해결책으로 충분할 수 있다는 것이다. [출처: PDF 6페이지][openai-pdf]

### RWA 프로젝트에 적용한 해석

**LLM 에이전트를 만드는 것 자체가 목적이 아니라, 기존의 명확한 규칙으로 해결하기 어려운 문제가 있는지 먼저 확인한다**는 설명에 적합하다.

### 인용 시 주의점

이 자료는 직접적인 비용 비교 연구가 아니라 에이전트 도입 판단을 위한 공식 가이드다. 자연어 해석도 에이전트가 유용할 수 있는 조건에 포함되므로, RWA 데이터가 구조화되어 있다는 이유만으로 질의 해석까지 항상 단순하다고 단정할 수 없다. 규칙 유지보수가 지나치게 어려워지면 반대로 에이전트를 검토할 이유가 된다는 점도 함께 제시한다. [출처][openai-pdf]

## 4. Google: 머신러닝 없이 제품을 출시해도 된다는 공식 원칙

**자료:** Rules of Machine Learning: Best Practices for ML Engineering  
**저자:** Martin Zinkevich  
**발행처:** Google for Developers  
**관련 부분:** Rule #1, Rule #3  
**원문:** [Google 공식 문서][google-rules]

### 원문 핵심

첫 번째 원칙은 다음과 같다.

> “Don’t be afraid to launch a product without machine learning.”

의미: 머신러닝 없이 제품을 출시하는 것을 두려워하지 말라는 것이다. 제품에 머신러닝이 반드시 필요한 것이 아니라면 단순한 휴리스틱으로 시작할 수 있다고 설명한다. [출처: Rule #1][google-rules]

다만 같은 문서의 Rule #3은 복잡한 휴리스틱보다 머신러닝을 선택하라고 권고한다. 규칙이 너무 복잡해지면 유지보수가 어려워진다는 이유다. [출처: Rule #3][google-rules]

### RWA 프로젝트에 적용한 해석

현재 선택한 **CSV 기반 규칙 관리, Python 컴파일 단계의 검증, 회귀 테스트**는 규칙의 복잡성과 변경 비용을 통제하기 위한 설계다. 다만 이 구조를 채택했다는 사실만으로 유지보수 비용이 낮아졌다고 입증되는 것은 아니다.

### 인용 시 주의점

“룰베이스가 언제나 머신러닝보다 우월하다”는 근거로 인용하면 안 된다. 이 자료는 LLM과의 직접적인 비용 비교가 아니라 일반적인 제품·ML 엔지니어링 원칙이다. 우리 프로젝트에서는 **요구되는 품질을 달성하면서 규칙의 복잡성을 관리할 수 있는가**가 핵심이다.

## 5. Gartner 보조자료: 토큰 요금보다 총소유비용이 중요

**자료:** Gartner Analysts Answer the Top Generative AI Questions for Your Enterprise  
**페이지 표기 갱신 시점:** 2025년 9월  
**관련 부분:** 생성형 AI의 투자수익률 및 총소유비용  
**원문:** [Gartner 기업용 생성형 AI 가이드][gartner-tco]

Gartner는 컴플라이언스 검토, 모델 재학습, 내부 간접비 같은 숨은 비용 때문에 생성형 AI의 총소유비용(TCO)이 초기 예상을 초과할 수 있다고 설명한다. 따라서 관련 지출을 추적해 전체 비용을 파악해야 한다는 취지다. [출처][gartner-tco]

모든 LLM 도입에 모델 재학습이 필요하다는 의미는 아니다. 실제 아키텍처에 해당하는 비용을 계산해야 한다. 마찬가지로 룰베이스 시스템도 보안 검토, 테스트, 유지보수 등의 비용에서 자유롭지 않다.

---

## 6. 현재 RWA 엔진의 경제성을 설명하는 방법

이 절은 외부 자료의 원문이 아니라, 현재 합의한 설계에 적용한 분석이다. 코드나 운영비를 직접 측정한 결과는 아니다.

### 현재 설계의 전제

```text
규칙·패턴 관리용 CSV
    ↓
Python 컴파일러
    ↓
command_patterns.txt
    ↓
브라우저의 결정론적 룰베이스 엔진
    ↓
기존 Tableau 데이터 조회 및 RWA 계산·분석 함수
    ↓
정해진 템플릿에 따른 답변
```

운영 경로에서 LLM, MiniLM, 학습된 임베딩, 외부 AI API를 사용하지 않는 설계를 전제로 한다. 위 흐름은 개념적인 요약이며, 각 기능의 구현 완료 여부를 뜻하지 않는다.

### 비용 항목별 의미

| 구분 | 현재 설계에서의 의미 |
|---|---|
| 운영 중 LLM 추론 비용 | LLM을 호출하지 않으므로 해당 비용이 발생하지 않는다. |
| 모델 서빙 인프라 | 이 엔진을 위한 모델 서버나 GPU 운영이 필요하지 않다. |
| 기존 시스템 비용 | Tableau, 호스팅, 데이터 관리, 브라우저 실행 자원 등은 여전히 필요하다. |
| 개발·유지보수 비용 | 규칙 추가, 파서 수정, 컴파일러 관리, 테스트, 오류 대응 비용은 여전히 존재한다. |
| 보안·운영 검토 | 모델 관련 검토 범위는 달라질 수 있지만, 데이터 접근 권한과 시스템 보안 검토는 여전히 필요하다. |

따라서 **“운영 중 LLM 추론비용이 없다”는 것은 설계에서 도출되지만, “총비용이 훨씬 저렴하다”는 것은 지원 범위·정확도·사용량·유지보수 시간을 함께 비교해야 하는 결론**이다.

개발 과정에서 사용한 코딩 도구나 AI 서비스의 비용이 있다면 개발비에 포함해야 한다. 운영 경로에서 LLM을 사용하지 않는다는 사실이 개발비까지 없다는 뜻은 아니다.

### 공정한 비교 대상

LLM이 직접 숫자를 계산하는 방식과만 비교하면 안 된다. 비교 대상은 **동일한 Tableau 데이터와 동일한 RWA 계산함수를 사용하는 LLM 기반 인터페이스**로 잡는 것이 공정하다. 이렇게 해야 계산 엔진의 차이가 아니라 질의 해석·제어·답변 계층의 경제성을 비교할 수 있다.

API 기반 LLM과 자체 호스팅 LLM도 비용 구조를 구분해야 한다. 자체 호스팅은 외부 토큰 청구가 없을 수 있지만 모델 실행·운영 자원이 필요하므로, 청구서의 유무가 아니라 총비용을 비교해야 한다.

### 실제 절감률을 주장하기 전에 측정할 항목

| 비교 항목 | 측정 내용 |
|---|---|
| 질의 처리 품질 | 동일한 대표 질문에서 의도·그룹·지표·기간·조건을 올바르게 해석하고 정답을 제공한 비율 |
| 실패 처리 품질 | 모호한 질문에 재질문하는지, 지원하지 않는 질문을 잘못 실행하지 않는지 |
| 응답 시간 | 동일한 데이터와 환경에서 일반적인 지연 및 느린 요청의 지연 |
| 총비용 | 개발·배포·운영·검토·유지보수 비용을 같은 기간과 사용량 기준으로 비교 |
| 변경 비용 | 신규 표현·별칭·기능을 추가할 때 필요한 작업 시간과 회귀 오류 |

특히 범위를 좁혀 비용만 낮춘 시스템과 더 넓은 질문을 처리하는 시스템을 그대로 비교하지 않도록, **지원 범위와 품질 기준을 먼저 합의**해야 한다.

## 7. 사내 설명용 문안

아래 문안은 위 자료들을 현재 설계에 적용한 정리이며, 특정 기관의 원문 인용은 아니다.

> 업무 범위와 계산 규칙이 명확한 RWA 질의·분석에서는 범용 LLM이 반드시 필요한 것은 아니다. 결정론적 룰베이스 엔진은 운영 중 LLM 추론비용과 모델 서빙 의존성을 제거할 수 있으며, 요구되는 질의 처리 품질을 충족하고 규칙 유지보수 비용을 통제할 수 있다면 더 낮은 총소유비용을 달성할 수 있다.

현재 단계에서는 **“비용 절감 가능성을 뒷받침하는 설계와 외부 근거가 있다”**고 표현하는 것이 적절하다. “LLM 대비 몇 % 절감” 또는 “LLM보다 정확하다”는 주장은 동일 조건의 자체 벤치마크 결과가 확보된 뒤에 제시해야 한다.

## 8. 어떤 자료를 우선 제시할 것인가

사내 설명에 하나만 제시한다면 **Gartner 아티클**을 우선 추천한다. 규칙·휴리스틱을 대안으로 명시하고 비용·위험·이해 가능성을 직접 다루기 때문이다. 이는 이 문서의 활용상 추천이지, 자료 간 정량 평가 결과는 아니다. [Gartner 원문][gartner-article]

보조자료로는 **OpenAI 가이드의 결정론적 해결책 관련 문장**, **Chip Huyen의 불필요한 생성형 AI 사용 사례**, **Google의 단순한 접근과 유지보수 한계에 관한 원칙**을 함께 제시하면 설계 논리와 한계를 설명하는 데 도움이 된다.

---

## 원문 URL 모음

### Gartner — 주요 아티클

<https://www.gartner.com/en/articles/when-not-to-use-generative-ai>

### Chip Huyen — 블로그

<https://huyenchip.com/2025/01/16/ai-engineering-pitfalls.html>

### OpenAI — 공식 PDF와 안내 페이지

<https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf>

<https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/>

### Google — 공식 ML 엔지니어링 지침

<https://developers.google.com/machine-learning/guides/rules-of-ml>

### Gartner — 총소유비용 보조자료

<https://www.gartner.com/en/topics/generative-ai>

---

**이용 메모:** 이 문서는 원문의 짧은 인용과 요약, 프로젝트에 적용한 해석을 담고 있다. 원문 전체의 복제본은 아니다. 웹페이지의 내용·표기일·접근 조건은 추후 변경될 수 있다.

[gartner-article]: https://www.gartner.com/en/articles/when-not-to-use-generative-ai
[chip-huyen]: https://huyenchip.com/2025/01/16/ai-engineering-pitfalls.html
[openai-pdf]: https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
[openai-page]: https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/
[google-rules]: https://developers.google.com/machine-learning/guides/rules-of-ml
[gartner-tco]: https://www.gartner.com/en/topics/generative-ai

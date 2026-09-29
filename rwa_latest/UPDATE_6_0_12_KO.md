# 6.0.12 업데이트 변경 내역 및 사용 안내

## 소스 반영 상태

이 디렉터리에는 채팅 UX와 과거 월별 RWA 증감률 최고/최저 보고서의 개별 소스가 포함되어 있습니다. 이전 안내서만 추가한 상태를 대체합니다.

- 대상: `carloskmhan/jsfile`, `rwa_latest/`
- 런타임 기준: `bfd51962a6a760c0bafd161b0bdbc2c478a8bb00`
- 이번 적용 전 기준: `c48bb72b6cafd24c8f5f069feeefc72112a38f33`
- 버전: `6.0.12-history-percent-review / 6.0.11-chat-ux`
- 실행 파일과 새 보고서 정의를 함께 반영하고 `command_patterns.txt`를 재생성했습니다. ZIP이나 압축 해제 프로그램만 올린 구성이 아닙니다.

새로 전체 폴더를 내려받은 경우 새 보고서는 이미 설치되어 있습니다. 기존 로컬 사용자 규칙을 보존하며 업데이트하는 경우에는 수정 소스를 반영한 뒤 `python install_historical_peak.py`를 실행하십시오. GitHub의 샘플 규칙으로 기존 사용자 규칙 폴더를 덮어쓰지 마십시오.

실제 변경 목록은 `PUBLICATION_6_0_12_FILES.json`, 이번 게시 검증은 `reports/publication_6_0_12.json`을 확인하십시오. 기존 `reports/chat_ux/`는 전달 패치의 과거 개발 검증입니다. 실제 은행 Tableau/SSO 검증이나 자동 사내 배포를 뜻하지 않습니다.

## 1. 패치에 포함된 기능

1. `Run report`와 `Cancel`을 같은 높이의 한 줄 버튼으로 정렬하고 기존 실행 중 스피너를 유지합니다.
2. 질문 전송 직후 해당 질문을 화면에 표시합니다. 사용자가 위로 스크롤하면 최신 메시지 자동 추적을 멈추고 `Latest message`로 다시 따라갑니다.
3. 완료된 답변을 타이핑하듯 순차 표시합니다. `Show full answer`로 즉시 전체를 볼 수 있습니다. 이미 계산된 텍스트를 표시하는 효과이며 LLM 스트리밍이 아닙니다.
4. 넓은 화면에는 예시 질문 20개를 왼쪽에, 좁은 화면에는 `Examples`로 표시합니다. 예시 클릭은 입력창만 채우며 자동으로 실행하지 않습니다.
5. 일반 금액 보고서의 특정 긴 계산 기준 설명은 `Calculation notes`로 접습니다. 데이터 누락, 부분 순위, 미설명 잔차 같은 중요 경고를 일괄 숨기지는 않습니다.
6. 그룹별 과거 월간 RWA 증감률의 최고/최저치를 찾아 순위를 매기는 보고서를 추가합니다. 그룹 ID, 그룹명, 해당 월, 월간 증감률, 같은 월의 RWA 증감액을 표시합니다.

기존 시작 화면, Tableau SSO 연결 흐름, 로딩 점 애니메이션, 그룹 ID 구분 및 복수 주요 driver 설명은 유지하는 패치입니다. 새 모델, 학습, AI API, 데이터베이스 또는 Tableau worksheet가 추가되는 방식이 아닙니다.

## 2. 수정 대상 21개 파일

```text
app.js
demo.html
loading_screen.css
rwa_engine.js
semantic/engine.js
semantic/features.js
semantic/followups.js
semantic/grammar.js
semantic/registry.js
semantic/routing.js
semantic/slots.js
semantic/validation.js
rule_manager.py
capability_manager.py
local_manager/simple.js
local_manager/simple_logic.js
tools/rule_schema.py
tools/compiler_extensions.py
local_manager_tests/test_manager.py
simple_manager_tests/test_capabilities.py
simple_manager_tests/browser_workflow.py
```

위 목록은 전달 패치의 변경 소스입니다. 실제 Git 변경에는 생성 규칙, 단일 데모, 게시 문서와 검증 목록도 포함됩니다.

## 3. 새로 추가되는 18개 파일

주요 기능 파일:

```text
chat_ui.js
chat_examples.js
historical_peaks.js
install_historical_peak.py
```

테스트 및 이전 규칙 보존용 합성 fixture:

```text
tests/peak_chat_checks.mjs
tests/test_peak_installation.py
tests/chat_ux_browser.py
tests/notes_browser.py
tests/history_manager_browser.py
tests/current_http_check.py
tests/fixtures/pre_historical_peak/command_patterns.txt
tests/fixtures/pre_historical_peak/rules/synonyms.csv
tests/fixtures/pre_historical_peak/rules/fuzzy_config.csv
tests/fixtures/pre_historical_peak/rules/temporal.csv
tests/fixtures/pre_historical_peak/rules/settings.csv
tests/fixtures/pre_historical_peak/rules/units.csv
tests/fixtures/pre_historical_peak/rules/followups.csv
tests/fixtures/pre_historical_peak/rules/commands.csv
```

패치 설명서, 검증 보고서 및 독립형 샘플 데모 등 부속 산출물은 위 39개 소스/테스트 파일 수에 포함하지 않았습니다. 테스트 fixture의 CSV를 실제 `rules/` 위에 복사하지 마십시오.

## 4. 적용 및 실행 순서

### A. 기존 로컬 프로젝트에 적용

실행 중인 관리자 도구를 `Ctrl+C`로 종료하고 현재 프로젝트 전체를 백업합니다. GitHub 변경 목록의 소스와 하위 폴더를 기존 작업 폴더에 반영하되 기존 사용자 CSV, 설정 및 나머지 파일은 보존합니다. 직접 수정한 HTML/CSS는 변경 사항을 병합합니다.

프로젝트 폴더에서 한 번 실행합니다. 환경에서 명령 이름이 `python`인 경우 아래의 `python3` 대신 `python`을 사용하십시오.

```bash
cd rwa_latest
python3 install_historical_peak.py
python3 build_command_patterns.py --check
```

설치기는 사용자의 기존 CSV를 읽어 새 역사적 증감률 명령, 표현과 충돌 방지 feature를 추가한 뒤 기존 compiler를 실행합니다. 기존 표현을 샘플 규칙으로 교체하지 않습니다. 이 단계에서 로컬에서 갱신되는 파일은 다음 세 개입니다.

```text
rules/commands.csv
rules/synonyms.csv
command_patterns.txt
```

충돌이나 검증 실패가 발생하면 그대로 배포하지 마십시오. 기존 백업·revision lock·rollback 경로를 이용하며 백업은 `.rule_manager/backups/`에 남깁니다.

### B. 규칙 관리자 사용

```bash
python3 rule_manager.py
```

브라우저 주소:

```text
http://127.0.0.1:8765/
```

추가되는 기능 카드는 **Rank groups by historical monthly percentage peaks**입니다. `Add new capability` 또는 `Fix interpretation`에서 대표 질문을 입력하고 이 기능을 고른 뒤 세부 의미와 기간을 선택하여 예문 검사, `Review`, `Save` 순으로 진행합니다.

예시 대표 질문:

```text
Survey groups by highest monthly percentage change over all history
```

기간은 `All available history`로 선택할 수 있습니다. 최고와 최저는 다른 의미이므로 각각의 표현이 올바르게 인식되는지 검사하십시오. 예시 버튼 파일을 수정하는 것만으로 파서에 새로운 의미가 등록되지는 않습니다.

일반 관리자 실행에는 Python 3.10+와 브라우저가 필요하며 Node, pip 패키지, 모델은 필요하지 않습니다. 브라우저 자동화 테스트의 개발 의존성과는 별개입니다.

### C. 채팅 화면 사용

다른 터미널에서 같은 `rwa_latest/`로 이동하여 실행합니다.

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

브라우저 주소:

```text
http://127.0.0.1:8000/demo.html
```

`demo.html`은 ES module과 fetch를 사용하므로 파일을 더블클릭하는 대신 위 HTTP 주소로 엽니다. 프로젝트 전체를 외부 공유용 웹 서버로 노출하지 마십시오.

질문 입력 → `Send` 또는 Enter → 해석 확인 → `Run report` 순으로 사용합니다.

```text
Show top 10 groups by highest monthly percentage change over all history
Show top 10 groups by lowest monthly percentage change over all history
Show top 10 groups by highest monthly percentage change from May to July
Top 5 groups by peak RWA increase over all history
```

`all history`는 승인된 데이터에 실제 존재하며 분석 기준 월 이내인 기간을 의미합니다. 없는 과거 데이터를 새로 가져오거나 현재 분석 종료일을 무시하지 않습니다.

### D. 별도 웹 서버 또는 SharePoint 배포

아래 15개 런타임 파일과 **설치 후 로컬에서 생성한** `command_patterns.txt`를 함께 반영합니다.

```text
app.js
demo.html
loading_screen.css
rwa_engine.js
chat_ui.js
chat_examples.js
historical_peaks.js
semantic/engine.js
semantic/features.js
semantic/followups.js
semantic/grammar.js
semantic/registry.js
semantic/routing.js
semantic/slots.js
semantic/validation.js
command_patterns.txt
```

기존 승인된 `tableau_config.txt`, `rules_config.txt`, 데이터, SSO/API 설정을 보존합니다. 이 패치 때문에 `build_tableau_csv.py`를 다시 실행하거나 새 Tableau worksheet를 만들 필요는 없습니다. 소스와 생성 규칙의 버전을 맞추어 배포하고 브라우저를 완전히 새로고침하십시오. 실행 중인 관리자는 런타임을 캐시하므로 재시작합니다.

## 5. 과거 최고·최저 증감률의 의미

```text
월간 RWA 증감액 = 당월말 그룹 RWA - 전월말 그룹 RWA
월간 증감률 = 월간 RWA 증감액 / 전월말 그룹 RWA
```

각 그룹에서 선택 기간의 최고 또는 최저 월간 증감률을 하나 골라 그룹을 정렬합니다. 표시되는 월과 금액은 그 최고/최저치를 기록한 동일 월의 값이지, 전체 기간 누적 증감액이 아닙니다.

실제 인접 월 잔액을 우선 사용합니다. 전월 잔액이 없거나 0 이하이면 제외하고 coverage에 반영하며, builder가 역산한 전월 잔액을 이 새 보고서의 분모로 사용하지 않습니다. 최고치가 반드시 양수인 것은 아닙니다. 그룹 구성원이 월별로 달라질 수 있어 고정 고객 집단의 변화 분석과는 다릅니다.

초기 구현은 그룹 제외와 기간 지정을 지원하지만 driver/entity 제외, threshold 필터, 혼합 비교 및 모호한 결과 참조 후속 질문은 지원하지 않으며 무시하는 대신 거부합니다.

## 6. 검증 상태의 구분

이전 안내서만 추가한 커밋에서는 테스트를 재실행하지 않았습니다. 이번 소스 게시에서는 기존 질문 파싱 626/626, robustness 파싱 225/225, 새 Peak 계산·해석 검사 42/42, CSV 설치·보존·롤백 9개, 모의 Tableau 84개, 관리자 76개 검사를 다시 실행하여 통과했습니다. 실제 로그와 범위는 `reports/publication_6_0_12.json`에 기록했습니다. 브라우저 및 은행 Tableau/SSO 시험을 이번 게시에서 새로 수행한 것은 아닙니다.

은행의 실제 Tableau/SSO/RLS 및 실고객 데이터 검증은 수행되지 않았습니다. 이전 검증 환경의 Chromium localhost 접근은 관리자 정책으로 차단되어, 브라우저 UI 검증은 실제 모듈과 합성 데이터를 사용한 메모리 내 페이지에서, Python HTTP 검증은 별도로 수행했다고 보고되어 있습니다. 기존 full runner에는 이전에 제거된 긴 설명 문구를 기대하는 builder 표시 문자열 assertion 실패가 남아 있으며 전체 테스트 통과로 보고된 상태가 아닙니다.

원본 근거 문서: `PATCH_CHAT_UX_AND_HISTORICAL_PERCENT.md`, `FILES_CHANGED.json`, `verification_summary.json` (이전 전달 패치 산출물).

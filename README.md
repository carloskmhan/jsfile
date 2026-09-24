# RWA Reports — Fixed-command edition

**3.0.0-review | 개발·검토용 배포본 | No ML runtime**

기존 RWA/Tableau 패키지의 데이터 계약과 조회 연결을 유지하되, 입력을 사전에 등록된 명령·인자로만 변환합니다. 의미 임베딩, 학습된 분류기, 모델 가중치, ONNX, 모델용 WASM, 자동 규칙 학습, 외부 AI 호출이 없습니다.

**Non-ML은 Non-AI 분류 보장이 아닙니다.** 정확한 코드·사용 목적·개발 과정을 귀행에서 검토해야 합니다. `DEPLOYMENT_REVIEW.md`를 먼저 읽으십시오. 라이브 모드는 기본 잠금 상태입니다. 소프트웨어와 규칙의 개발에는 ChatGPT의 도움이 사용되었으며, 운영 시 AI 서비스를 호출하지 않는 것과 개발 도구 사용 정책은 별개입니다.

## 1. 샘플 확인

`standalone_demo.html`을 실제 브라우저에서 여십시오. 합성 금융 데이터만 포함된 단일 HTML입니다. 별도 모델·서버·설치가 필요하지 않습니다. 모바일 파일 미리보기나 일부 기업 브라우저는 JavaScript를 실행하지 않을 수 있습니다.

```text
Walk me through Samsung Group RWA increase in June 2026
Which entity?
What drove that entity?
Exclude FX
And Samsung SDI?
Compare the two
Same for May
```

매번 먼저 Report / Group / Entity / Period / Metric / Exclusions 등을 확인한 후 **Run report**를 누릅니다. Cancel은 계산을 실행하지 않습니다. Enter는 명령 제출, Shift+Enter는 줄바꿈입니다. `New chat`은 현재 화면 대화와 메모리 상태를 초기화합니다.

`standalone_demo.html`은 샘플 전용입니다. 실제 Tableau 연결에는 `demo.html`과 모듈 파일을 사용하십시오.

## 2. 웹 실행

승인된 사내 정적 호스트에 폴더를 배포합니다. 로컬 개발 확인만 필요하면 다음을 실행합니다.

```bash
cd rwa_command_tableau_v3
node serve.mjs
```

브라우저에서 `http://127.0.0.1:8000/demo.html`을 엽니다. `commands_editor.html`도 같은 호스트에서 엽니다. `file://`로 `demo.html`을 여는 것은 ES module/fetch 로딩 방식상 지원하지 않습니다. Node는 이 로컬 확인 서버용이며 운영 시 필수 서버가 아닙니다. 추가 npm 패키지는 없습니다.

## 3. 실제 동작

```text
등록된 영어 명령 + 화면/대화의 기존 선택값
  → 전체 문장·고정 modifier 검사
  → 명령 ID와 명시적 계산 인자
  → 사용자 확인
  → 이미 작성된 집계·정렬·비교·잔차 계산
  → 고정 문장/표
```

단어 몇 개만 맞는다고 나머지 조건을 무시하지 않습니다. 미등록 표현, 모호한 이름, 서로 다른 명령 후보, 지원하지 않는 조건은 확인 메시지로 종료합니다. 모든 자연어를 이해하는 모델이나 개방형 질의 엔진은 아닙니다.

기존 문장 parser는 완전 일치한 명령의 **고정된 인자 변환기**로만 사용합니다. 앞단 template가 맞지 않으면 해당 parser로 우회하지 않습니다. 지식 그래프·연역 추론·추론 규칙 chaining·임베딩 유사도·학습은 없습니다.

## 4. 유지보수할 파일

| 파일 | 역할 |
|---|---|
| `command_patterns.txt` | 425개 등록 template, 고정 표현 치환, 접두어. 학습 데이터/가중치 아님 |
| `commands_editor.html`, `commands_editor.js` | 명령 template 추가·활성화·검증·다운로드 |
| `rules_config.txt` | 그룹/계열사 수동 별칭 중 계열사 alias 설정 |
| `rwa_sample_data.txt` | 그룹/계열사 ID·명칭·별칭 카탈로그. 금융 실적 원천 아님 |
| `rule_parser.js` | 전체 명령 template와 허용 modifier 검사 |
| `command_fields.js` | 승인된 canonical command의 고정 인자 변환 |
| `rwa_engine.js` | 산술 계산·데이터 검증·정해진 보고 문장 |
| `rule_client.js` | 메모리 상태·preview·confirm·invalidate |
| `app.js`, `demo.html`, `styles.css` | 대화형 UI·조건 확인 화면 |
| `tableau_adapter.js`, `csv_adapter.js` | 기존 Tableau v2/CSV/JSON 계약 |
| `bootstrap.js`, `network.js` | 설정·초기화·same-origin 파일 로딩 |
| `tableau_config.txt` | Tableau URL·필드 매핑·운영 모드 |

## 5. 사용자가 새 표현을 추가하기

웹 호스트에서 `commands_editor.html`을 열고 다음처럼 추가합니다.

```text
Question template: give me the movement report for {scope}
Canonical command: explain {scope}
```

저장 버튼은 수정된 `command_patterns.txt`를 **다운로드**할 뿐, 운영 사이트를 직접 바꾸지 않습니다. 담당자가 의미와 충돌을 검토하고 테스트한 뒤 해당 파일을 승인 배포합니다. 모든 입력 slot이 출력에 보존되어야 하며 임의 regex, JavaScript, SQL은 등록할 수 없습니다. 새 계산은 예문 추가만으로 생기지 않습니다.

자세한 형식과 한계는 `COMMANDS.md`를 보십시오. `.txt`만 바꾼 뒤 웹 앱을 새로고침하면 새 registry를 읽습니다. Python 학습은 필요 없습니다. 단일 HTML 샘플은 별도 빌드 산출물이므로 자동 갱신되지 않습니다.

## 6. Tableau 연결

기존과 동일한 네 컬럼을 읽습니다.

```text
client_group_id | client_group_name | group_location | json_data
```

`json_data`에 있는 계열사/월 rows의 opening/closing RWA와 additive driver 금액을 사용합니다. 상세 행은 group/entity/month/product/location/record_id grain으로 구분합니다. 같은 grain 중복은 거절합니다. Product/location 질문은 해당 필드가 모든 선택 행에 있을 때만 처리합니다.

검토 후 `tableau_config.txt`의 다음 값을 변경합니다.

```json
{
  "mode": "tableau",
  "tableauUrl": "https://YOUR_APPROVED_TABLEAU_SERVER/views/WORKBOOK/DASHBOARD",
  "apiUrl": null,
  "worksheetName": "RWA_DATA",
  "catalogUrl": "./rwa_sample_data.txt",
  "commandPatternsUrl": "./command_patterns.txt",
  "requireConfirmation": true,
  "liveReviewAcknowledged": true
}
```

위는 변경할 일부 항목입니다. 전체 기존 config를 지우지 마십시오. `liveReviewAcknowledged`는 사내 승인 후 관리자가 설정하는 확인값일 뿐, 승인 인증서나 접근통제 경계가 아닙니다. `apiUrl`에는 기존 승인된 classic Tableau JS API 주소를 넣거나 null로 둡니다. `.onnx`나 Python 경로를 넣지 않습니다.

카탈로그를 실제 승인된 데이터로 바꾸고 필터/필드 이름을 맞추십시오. `allowPortfolioQueries`는 false가 기본이며 전체 그룹 조회가 승인된 경우에만 변경합니다. 브라우저 필터는 권한 통제가 아닙니다. Tableau RLS/JSON 내부 행 권한을 먼저 보장해야 합니다.

Tableau v2 연결은 기존 호환성 때문에 유지했습니다. 공식 문서는 v2 deprecation을 알리고 있으므로 귀행의 지원 버전과 이관 계획을 확인하십시오. [Tableau 공식 문서](https://help.tableau.com/current/api/js_api/en-us/JavaScriptAPI/js_api.htm)

### v3 후속 대화 개선

명시적인 상태 전환 규칙으로 `Why?`, `the next one`, `same for May`, `include FX back`, `compare that with last month`, `rank those by CG`, `clear exclusions` 등을 처리합니다. 이전 순위 결과를 가리키는 표현은 저장된 순위 목록만 참조하며, 임의 의미 추론은 하지 않습니다. Tableau 선택값과 대화 상태가 충돌할 때는 완전한 새 명령은 현재 Tableau context를 사용하고, 명시적인 후속 표현은 직전 대화 상태를 사용합니다. 모든 요청은 실행 전 preview에서 scope/period/metric/exclusion을 확인할 수 있습니다.

## 7. 계산 범위와 제한

금액 단위는 일관되어야 하며 기본 `USDm`에서 250은 USD250m입니다. null·문자열 숫자·Infinity·부적절한 중복은 거절합니다. 드라이버 합계와 순변동의 차이, 월별 balance 불연속, 계열사 coverage 변화를 표시합니다. 기록에 없는 월을 0이나 최신 월로 바꾸지 않습니다.

`FX 제외`는 기록된 기여분을 빼는 산술 조정입니다. 환율 불변 상태의 RWA 재계산이나 시뮬레이션이 아닙니다. 등급 변화의 경제적 이유, 미래 예측, 매매/신용 의사결정, 최적화는 지원하지 않습니다. 집중도는 산술 비중만 보고하며 high/low 위험 등급을 부여하지 않습니다.

같은 그룹 내 두 계열사 비교, 두 그룹 비교, 두 월 비교는 지원합니다. 두 계열사와 두 기간을 한 번에 교차 비교하거나 driver-filtered comparison은 명시적으로 거절합니다. 임의 compound English는 지원하지 않으며 등록 template의 조합 범위 내에서 처리합니다.

기간 내 RWA 잔액(stock)을 월별로 합산하지 않습니다. 월별 변동 합계와 endpoint 차이가 다르면 그 원인을 데이터 연속성 경고로 표시합니다. 신규 거래/EAD 또는 CG/PD 같이 겹칠 수 있는 분해 축은 upstream에서 정합성을 보장해야 합니다.

## 8. 검증

별도 `rwa_command_validation_v3.zip`에는 재현 도구와 상세 결과가 있습니다. 두 ZIP을 같은 상위 폴더에 풀면 테스트의 상대 경로가 맞습니다. 검증 폴더를 운영 웹사이트에 올리지 마십시오.

이번 빌드의 기존 Node 회귀 테스트는 181 + 46 = **227개 통과**, 추가 후속질문/응용질문 회귀 테스트는 **61/61 통과**, Chromium 대화 UI는 **17개 통과**, 명령 편집기 DOM은 **7개 통과**입니다. 모두 개발자 작성/합성 테스트입니다. 실제 Tableau·SSO·SharePoint, HTTP 모듈/CSP 헤더, 독립 사용자 테스트, 침투 테스트는 완료되지 않았습니다.

실제 기존 MiniLM INT8 모델·분류기와 기존 대화 관리 코드를 실행한 추가 비교도 별도 보고서에 있습니다. 개발자 작성 후속질문/응용질문 61개에서는 새 고정 명령 엔진이 **61/61**, 기존 MiniLM 애플리케이션이 **23/61**의 end-to-end command match를 기록했습니다. 이는 RWA 업무 기능·상태 처리 비교이며 MiniLM 자체의 일반 언어 이해 성능이나 독립 정확도 추정이 아닙니다. **99% 동등·범용 우월·비AI 승인 완료라는 주장은 하지 않습니다.**

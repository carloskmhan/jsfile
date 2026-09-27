# v5.0.2 — Wave dots on the existing loading screen

## 변경 내용

`loading_indicator_examples.html`의 첫 번째 효과(점 세 개가 차례로 위아래로 움직이는 wave dots)를 기존 로딩 타이틀 아래에 통합했습니다.

- 본화면 `header h1`의 타이틀을 복사하며 `No ML` 배지는 제외합니다.
- 타이틀과 점 세 개를 한 묶음으로 화면 중앙에 배치합니다.
- 점: 지름 7px, 간격 7px, 이동 -5px, 반복 1.4초, 시작 지연 0 / 0.16 / 0.32초. 기존 화면의 글자색을 사용합니다.
- 최초 로딩 화면이 활성화된 뒤 최소 5초를 표시합니다. 초기화는 뒤에서 동시에 진행되므로 데이터 로딩을 일부러 늦추지 않습니다.
- 초기화가 끝나면 최소 시간 이후 기존 720ms slide-up으로 타이틀/점/배경이 함께 사라지고 본화면을 표시합니다. 빠르게 준비되는 경우 전체 전환 완료까지 약 5.7초입니다.
- 초기화에 5초 이상 걸리면 기존 로직대로 기다립니다. 오류 발생 시 기존 오류 화면으로 전환합니다. 기존 45초 watchdog은 가림막만 해제하며 앱을 Ready로 만들지 않습니다.
- 질문 입력/필터 변경/New chat에서는 다시 표시하지 않습니다.
- `prefers-reduced-motion: reduce`이면 점을 정지시키고 기존 짧은 fade만 사용합니다. 최소 5초는 유지됩니다.
- 이 점 애니메이션은 실제 데이터 로딩 진행률을 나타내지 않습니다.

## 기존 v5.0.1에 적용 (권장: 2개 파일만 교체)

`rwa_v5_wave_dots_patch.zip`의 `demo.html`, `loading_screen.css`를 현재 웹 폴더의 동명 파일과 교체하고 캐시를 갱신해 페이지를 새로고침합니다.

기존 `loading_screen.js`와 완료 이벤트가 들어 있는 `bootstrap.js`가 설치된 v5.0.1이 전제입니다. 두 JS 파일은 변경하지 않았습니다. 아직 최초 5초 로딩 패치를 적용하지 않았다면 이 두 파일만으로 동작하지 않습니다. 이전 로딩 패치를 먼저 적용하거나 전체 v5.0.2 웹 배포본을 별도 staging 폴더에 설치하십시오.

`demo.html`을 직접 수정했다면 덮어쓰는 대신 로딩 영역의 markup만 병합합니다. 로딩 타이틀을 `.rwa-loading-content`로 감싸고 그 안에 `.rwa-loading-dots`와 세 `.rwa-loading-dot`을 넣는 변경입니다.

**Tableau URL·설정·실데이터·카탈로그·CSV 규칙·command_patterns.txt를 덮어쓰지 마십시오.** 기존 계산·대화 상태·앱 JS·스타일(styles.css)은 변경하지 않았습니다. 모든 기존 JS가 v5.0.1과 바이트 단위로 동일함을 확인했습니다.

## 미리보기 ZIP

`rwa_wave_dots_demo.zip`을 풀고 `standalone_demo.html`을 JavaScript가 실행되는 브라우저로 열면 합성 데이터가 포함된 전체 화면을 확인할 수 있습니다. 파일 미리보기 앱은 JavaScript를 실행하지 않을 수 있습니다.

이 데모는 외부 파일을 읽지 않는 별도 내장 HTML입니다. 실제 사이트의 설정·CSS를 바꾸어도 이 파일은 자동 변경되지 않습니다. 이번에는 기존 내장 CSS/markup만 갱신하고 CSP의 inline CSS 해시도 다시 계산했습니다. 모든 inline JS와 업무 코드는 보존했습니다.

## 전체 웹 배포본

`rwa_semantic_tableau_v5_0_2_web.zip`은 v5.0.1 전체 웹 runtime에 이 UI 변경을 반영한 것입니다. 은행 설정/규칙/데이터를 옮겨야 하므로 기존 운영 폴더 전체에 무조건 덮어쓰지 마십시오. 신규 runtime 파일 없이 `demo.html`과 `loading_screen.css`만 변경했으며, 빌드 정보와 설명서는 별도 갱신했습니다.

## 검증

Chromium 144.0.7559.96에서 합성 standalone HTML 및 분리된 느린 초기화/오류 fixture로 20개 검사 통과:
타이틀 복사, 점 3개, 시간차 움직임, 중앙 배치, 5초 유지, 720ms 전환, 기존 질문 preview/confirm/답변, New chat, 모바일, 동작 줄이기, 느린 초기화 및 실패 후 표시.

HTTP demo.html 탐색은 현재 환경에서 ERR_BLOCKED_BY_ADMINISTRATOR로 차단되었습니다. 브라우저 정책이나 CSP를 완화하지 않았습니다. 실제 은행 Tableau/SSO/SharePoint, HTTP 모듈/CORS/CSP/권한 및 보안 인증은 검증하지 않았습니다. UI-only 변경이라 MiniLM 비교나 전체 금융 회귀 스위트는 재실행하지 않았습니다.

이 UI 변경은 보안/거버넌스 분류나 승인을 대체하지 않습니다.

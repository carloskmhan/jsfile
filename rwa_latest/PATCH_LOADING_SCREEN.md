# v5.0.1 UI patch — five-second title loading screen

## 동작

기존 v5 앱을 그대로 사용하면서, 페이지를 열 때 메인 제목만 중앙에 보여 줍니다.
현재 제목은 **RWA Reports**입니다. `header h1`의 실제 텍스트를 읽으며 `.badge`는 복사하지 않습니다.

- 초기화는 로딩 화면 뒤에서 동시에 진행됩니다. Tableau/규칙/데이터 요청을 5초 뒤로 미루지 않습니다.
- 최소 5,000ms 표시 후, 실제 초기화가 끝났으면 화면 전체가 720ms 동안 위로 부드럽게 올라가며 사라집니다. 뒤쪽 메인 화면은 동시에 fade-in합니다.
- 보통 페이지 시작 후 약 5.7초에 상호작용 가능한 본화면으로 전환됩니다.
- 초기화가 5초보다 오래 걸리면 실제 완료까지 기다립니다.
- 초기화 오류도 종료 신호를 보내므로, 최소 표시 시간 후 기존 오류 메시지를 보여 줍니다. 오류를 Ready로 바꾸지 않습니다.
- 무한 대기 방지를 위해 약 45초 후에는 가림막만 해제합니다. 앱의 실제 Loading/오류 상태와 비활성화된 컨트롤은 그대로 유지합니다.
- 로딩 중 메인 화면은 inert/aria-hidden 상태입니다. 전환 후 원래 속성을 복원하며, 모바일 키보드를 자동으로 열지 않습니다.
- 접근성 설정 `prefers-reduced-motion: reduce`이면 위로 이동하지 않고 120ms fade로 전환합니다. 5초 유지 시간은 같습니다.
- 새 질문, 필터 변경, New chat에서는 로딩 화면을 다시 실행하지 않습니다. 새 페이지 로드 시에만 동작합니다.

## 기존 v5에 적용

`rwa_v5_loading_screen_patch.zip` 안의 아래 네 파일을 기존 `demo.html`과 같은 위치에 배포합니다.

| 파일 | 조치 |
|---|---|
| `demo.html` | 교체: loading CSS/JS 링크와 title cover markup 추가 |
| `bootstrap.js` | 교체: 기존 초기화 try/catch 뒤에 완료 이벤트 finally 추가 |
| `loading_screen.js` | 신규: 최소 시간, 완료 대기, title 동기화, 입력 차단과 해제 |
| `loading_screen.css` | 신규: 중앙 title, slide-up, fade, reduced-motion |

**`tableau_config.txt`, 카탈로그, CSV 규칙, `command_patterns.txt`, RWA/semantic/상태 관리 코드는 교체하지 않습니다.**
기존 `styles.css`와 `app.js`도 변경하지 않았습니다. 사내 설정과 직접 작성한 규칙을 보존하십시오.

`demo.html`/`bootstrap.js`를 별도로 수정한 환경에서는 덮어쓰기 전에 변경분을 병합하십시오.
모든 파일은 동일한 승인된 웹 origin에서 제공하고 캐시를 갱신해 함께 반영하십시오.
이 변경은 `demo.html`에 별도 wrapper를 만들거나 Tableau host를 `display:none` 처리하지 않으므로 기존 레이아웃 크기를 유지합니다.

### 제목 / 유지 시간

메인 페이지의 `header h1` 제목이 바뀌면 로딩 제목도 자동으로 따라갑니다. 로딩 제목에 별도로 회사명을 넣을 필요는 없습니다.

`demo.html`에서 아래 속성을 변경하면 유지 시간이 바뀝니다. 단위는 ms입니다.

```html
<div id="rwa-loading-screen" data-minimum-ms="5000" ...>
```

`loading_screen.css`의 `transition: transform 720ms ...`는 위로 사라지는 시간입니다. 기존 styles.css는 편집할 필요가 없습니다.

### 단일 HTML 데모

제공한 `standalone_demo.html`은 이 변경과 합성 데이터를 내장합니다. 외부 설정이나 JS를 바꾼 것만으로 단일 HTML이 자동 갱신되지는 않습니다.
원본 개발 폴더에서 재생성하려면 `tools/build_standalone.py`도 이번 파일로 교체한 뒤 아래를 실행합니다.

```bash
python tools/build_standalone.py
```

이 Python 파일은 웹 배포 대상이 아니며, 모델 학습을 하지 않습니다. `rwa_v5_loading_screen_patch.zip`의 `tools/` 폴더는 이 선택적 개발용 변경입니다.

## 검증 범위

- `python tests/test_loading_screen.py`: Chromium, 합성 단일 HTML, 23개 통과. 5초 유지 시간과 약 720ms 이동, desktop/mobile, 실제 메인 제목 복사, inert 해제, 원래 질문→preview→confirm, New chat, reduced motion, 6.5초 초기화, 초기화 오류, 선택적 splash script 누락을 확인했습니다.
- `node tests/run_all.mjs`: 기존 v5 검사를 재실행했으며 새 실패는 없습니다. 기존에 문서화된 legacy 기대값 차이 6개는 그대로 남아 있습니다.
- 실제 로컬 HTTP `demo.html` 탐색은 환경의 `ERR_BLOCKED_BY_ADMINISTRATOR`로 차단되었습니다. 정책을 바꾸거나 우회하지 않았습니다. 은행 Tableau/SSO/SharePoint/CSP/권한 검증 완료를 뜻하지 않습니다.
- 기존 MiniLM 비교는 이번 UI 변경에서 다시 실행하지 않았습니다. 기존 보고서는 기존 v5 개발 검증 기록입니다.

이 변경은 화면 연출입니다. 보안 통제, 데이터 권한, AI/non-AI 분류, 거버넌스 승인을 대체하지 않습니다.

# Reading 세션 수집 이벤트 사전

**대상 독자:** 나중에 이 데이터를 분석할 사람 (연구자 본인·조교).
**기준 코드:** `docs/reading.html`, `docs/tracking.js` (커밋 기준 2026-09-17).
여기 적힌 것만이 Firestore에 **실제로 저장**되는 것이다. 코드에 존재하지만 저장되지 않는 것은 맨 끝 §7에 따로 모았다.

---

## 1. 저장 위치와 공통 구조

```
users/{uid}/sessions/{sessionId}/eventBatches/{batchId}
```

| 필드 | 의미 |
|---|---|
| `batchSeq` | 세션 내 batch 순번 (1부터) |
| `writtenAt` | batch 기록 시각 (epoch ms) |
| `final` | 세션 종료 flush이면 `true` |
| `viaBeacon` | 창 닫힘 시 `sendBeacon`으로 들어온 batch면 `true` (그 외엔 필드 없음) |
| `topic`, `condition` | `'hafner2014'`, `no_ai` / `mm` / `mm_cimo` |
| `points[]` | 순간 이벤트 (§2) |
| `intervals[]` | 닫힌 구간 (§3) |

**flush 시점:** 누적 25건마다 또는 10초마다, 읽기 종료 시(`final`), 창이 닫힐 때(`pagehide` → beacon).
**세션 복원:** 모든 batch를 읽어 `batchSeq` → 각 원소의 `seq` 순으로 정렬. `seq`는 points와 intervals가 **공유하는** 세션 내 단조 증가 번호이므로 둘을 한 타임라인에 섞어 정렬할 수 있다.

### point 공통 필드

| 필드 | 의미 |
|---|---|
| `seq` | 세션 내 순번 |
| `t` | 발생 시각, `Date.now()` (epoch ms). **시각의 기준은 항상 이 값.** |
| `sinceStart` | `t − 세션 시작 시각` (ms). 시작 = §2.1 `reading_start` |
| `type` | 이벤트 이름 |
| `phase` | study2 로거를 거친 이벤트에만 있으며 항상 `'reading'` |
| (그 외) | 이벤트별 payload. 일부 study2 이벤트는 payload에 `timestamp`를 따로 가지는데 `t`와 같은 시계이며 `t`를 쓰면 된다 |

### interval 공통 필드

| 필드 | 의미 |
|---|---|
| `seq` | 구간이 **닫힌** 순간의 순번 |
| `stream` | `window` / `reading` / `panel` |
| `state` | 그 구간 동안의 상태 |
| `start`, `end` | epoch ms. 다음 구간의 `start`는 이전 구간의 `end`와 **같은 변수 값**이라 틈·겹침이 없다 |
| `duration` | `end − start` |
| `startSinceStart` | `start − 세션 시작` |
| `documentHidden` | `window` 스트림의 `deactivated` 구간에만: 페이지가 화면에서 사라졌으면 `true`, 포커스만 잃었으면 `false` |
| `truncatedByUnload` | 창이 닫혀 강제로 닫힌 구간이면 `true` (beacon batch에만). 우측 절단으로 취급 |

---

## 2. Point 이벤트

### 2.1 세션 경계

| type | 의미 | 포착 순간 (코드) | payload |
|---|---|---|---|
| `reading_start` | 읽기 세션 시작. 모든 interval 스트림이 여기서 열린다 | 시작 팝업 "Confirm & Start Reading" 클릭 → `readingActive`가 true가 되고 `currentUser`·`sessionId`가 준비된 시점에 `Tracker.startSession()` | `topic`, `condition` |
| `reading_paused` | 참여자가 Pause 누름 | 헤더 **Pause** 버튼 클릭 (`setPaused(true)`) | 없음 |
| `reading_resumed` | 가림막의 Resume 누름 | **Resume reading** 버튼 클릭 (`setPaused(false)`) | 없음 |
| `finish_reading_clicked` | Finish 버튼 누름 (통과 여부 무관) | 헤더 **Finish Reading** 클릭 직후 | 없음 |
| `finish_blocked_min_time` | 15분 미만이라 거부됨 | 위 클릭 후 `activeSeconds < 900`이면 (pause 시간 제외한 헤더 시계 기준) | `activeSeconds`, `remainingSeconds` |
| `finish_reading_confirmed` | 브라우저 확인창에서 OK | `window.confirm('Are you sure…')` 승인 | 없음 |
| `finish_reading_cancelled` | 확인창에서 취소 | 위 확인창 취소 | 없음 |
| `reading_phase_complete` | 읽기 단계 종료 + 요약 | 외부 도구 사용 팝업에서 **Continue** → `completeReading` 마무리 블록. `reading_end` **직전** | §4 참고 |
| `reading_end` | 모든 스트림 닫힘 | `reading_phase_complete` 직후 `Tracker.endSession('finished')` | `reason: 'finished'` |

순서는 항상: `finish_reading_clicked` → (`finish_blocked_min_time` 또는 `finish_reading_confirmed`/`cancelled`) → `reading_phase_complete` → `reading_end` → 세션 문서 `reading` 저장 → post-task 이동.

### 2.2 창 활성

| type | 의미 | 포착 순간 | payload |
|---|---|---|---|
| `window_activated` | 창이 다시 활성됨 | `document.visibilitychange`(보임) 또는 `window.focus` — **상태가 실제로 바뀔 때만** 1건 (blur와 visibilitychange가 같은 행동에 둘 다 울려도 중복 없음) | `cause`: `'visibilitychange'` / `'focus'`, `documentHidden` |
| `window_deactivated` | 창이 비활성됨 | `visibilitychange`(숨김) 또는 `window.blur` | `cause`: `'visibilitychange'` / `'blur'`, `documentHidden` |
| `window_closed_during_reading` | 읽기 중 창을 닫음/이동 | `pagehide` — `reading_end` 전에만. beacon batch에 실림 | 없음 |

`documentHidden`: `true` = 탭 전환·최소화·화면 잠금(페이지가 안 보임). `false` = 다른 앱/창으로 포커스만 이동(논문은 화면에 보이는 상태). **후자를 "이탈"로 단정하면 안 된다.** 잡히지 않는 것: 다른 기기 사용, 화면에서 눈만 뗌.

### 2.3 패널 · 탭

| type | 의미 | 포착 순간 | payload |
|---|---|---|---|
| `focus_switch` | 마우스가 **논문 패널 ↔ AI 패널 경계를 넘음** | 논문 패널 `mouseenter` → `switchFocus('reading')`, AI 패널 `mouseenter` → `switchFocus(현재 탭)`; 직전 `activeFocus`와 다를 때만. `no_ai`에서는 발생하지 않음 | `from`, `to` ∈ `reading\|chat\|audio\|video\|infographics` (AI 패널 진입 시 `to` = 그때 열려 있던 탭), `timeOnPreviousFocus` (ms) |
| `resource_tab_switch` | AI 패널 **안에서** 탭 클릭 | 현재 탭과 다른, 로딩 중 아닌 탭 클릭 (`handleTabSwitch`) | `from`, `to` ∈ `chat\|audio\|video\|infographics`, `timestamp` |
| `panel_resized` | 패널 구분선 드래그 종료 | 구분선 드래그 후 `mouseup` | `leftPanelWidth` (논문 패널 너비 %) |

`focusTimes`(§4)는 위 두 이벤트의 `timeOnPreviousFocus`/체류시간을 focus별로 누적한 값이다. 패널 단위의 시간축은 §3 `panel` 스트림이 별도로 제공한다.

### 2.4 논문 읽기 (`pdf_activity` 상태기계)

논문 패널은 `idle → viewing → scrolling → reading` 상태를 가진다. 모두 `type: 'pdf_activity'`이고 `action`으로 구분한다.

| `action` | 의미 | 포착 순간 | payload |
|---|---|---|---|
| `area_enter` | 마우스가 논문 영역에 들어옴 | 논문 영역 `mouseenter`, 직전 상태가 `idle`일 때만 | `state: 'viewing'` |
| `scroll_start` | 스크롤 시작 | 논문 영역에서 `wheel` 이벤트, 직전 상태가 `scrolling`이 아닐 때 | `previousState`, `timeInState` (직전 상태 지속 ms), `state: 'scrolling'` |
| `scroll_stop` | 스크롤 멈춤 → 읽는 중 | 마지막 `wheel` 후 **2000ms** 무입력 | `timeScrolling` (ms), `state: 'reading'` |
| `area_leave` | 마우스가 논문 영역을 벗어남 | 논문 영역 `mouseleave` | `previousState`, `timeInState`, `state: 'idle'` |

주의: `wheel`만 본다(마우스 휠·트랙패드). 스크롤바 드래그, 키보드 스크롤은 `scroll_start/stop`을 만들지 않는다. 페이지 번호·스크롤 위치는 현재 저장하지 않는다(의도적).

| type | 의미 | 포착 순간 | payload |
|---|---|---|---|
| `scroll_action` | 논문 패널을 **떠날 때** 직전 체류 구간의 분류 | `switchFocus`에서 `reading → AI 패널`로 넘어갈 때 1건 (`no_ai`에서는 발생 안 함) | `classification`: `pauseDuration > 5000` → `'reading'`, `> 2000` → `'scanning'`, 그 외 `'scrolling'`; `pauseDuration` = 논문 패널에 마지막으로 들어온 시각(또는 세션 시작)부터의 ms; `sectionBeforeScroll`/`sectionAfterScroll` = 현재 섹션명 (페이지 위치 → `Abstract/Introduction/Method/Results/Discussion/References`); `scrollY`(항상 0에 가까움, 무시), `scrollDuration: 0`, `isFocusSwitch: true`, `timestamp` |

즉 `scroll_action`은 "스크롤"이 아니라 **논문 패널 체류 구간의 길이 기반 분류**다. 이름은 study2 유산.

### 2.5 미디어 (`mm`, `mm_cimo`)

`audio` = Podcast 탭, `video` = Video Overview 탭. 브라우저 미디어 요소의 이벤트를 그대로 받는다.

| type | 포착 순간 | payload |
|---|---|---|
| `audio_play` / `video_play` | 재생 시작 (`play` 이벤트) | `currentTime`, `timestamp` |
| `audio_pause` / `video_pause` | 일시정지 (`pause` 이벤트). **재생 끝에서도 `pause`가 먼저 울리므로 `ended` 직전에 1건 더 생긴다** | `currentTime`, `timestamp` |
| `audio_ended` / `video_ended` | 끝까지 재생 | `duration`, `timestamp` |
| `audio_seeked` / `video_seeked` | 탐색 완료 (`seeked`) | `from` (탐색 전 위치, `seeking`에서 캡처), `currentTime` (탐색 후), `timestamp` |

인포그래픽 탭은 별도 이벤트가 없다 — 열람은 `resource_tab_switch`/`focusTimes.infographics`로 본다.

### 2.6 챗봇 (`mm`, `mm_cimo`)

| type | 의미 | 포착 순간 | payload |
|---|---|---|---|
| `llm_activity` | 챗 입력창에서의 **타이핑 / 비타이핑 구간** | ① 채팅 패널에 포커스가 있을 때 키 입력(`keydown`): 타이핑 중이 아니었고 마지막 활동 후 100ms 초과면 `none-typing` 1건(그 공백 길이). ② 마지막 키 입력 후 **2000ms** 무입력 → `typing` 1건(버스트 시작~멈춤). ③ 챗 패널을 떠날 때(`switchFocus`) 진행 중 구간을 마감 (`isFocusSwitch: true`) | `classification`: `'typing'` / `'none-typing'`, `duration` (ms), (`isFocusSwitch`) |
| `llm_question_asked` | 질문 전송 | Enter 또는 전송 버튼 | `question`, `timestamp` |
| `llm_answer_received` | 답변 도착 | API 응답 수신 후 | `question`, `answer`, `responseTime` (ms), `timestamp`; **mm_cimo만** `contextDetected`, `extractedContext`, `cumulativeContext` |

키보드 입력만 타이핑으로 센다(마우스 붙여넣기는 안 잡힘). API 오류 시 `llm_answer_received`는 없고 화면에 오류 말풍선만 뜬다.

---

## 3. Interval 스트림

세 스트림 모두 **실제 이벤트가 발생한 순간의 시각**으로 구간을 닫고 다음 구간을 연다. 계산으로 만든 값이 아니다.

| stream | state | 전환 트리거 | 덮는 범위 |
|---|---|---|---|
| `window` | `activated` / `deactivated` | §2.2와 동일 (`visibilitychange`, `blur`, `focus`) | 세션 전체. 합 = 세션 길이 |
| `reading` | `on` / `paused` | Pause / Resume 버튼 | 세션 전체. 합 = 세션 길이 |
| `panel` | `reading` / `ai` / `none` | 논문 패널 `mouseenter` → `reading`, AI 패널 `mouseenter` → `ai`, 두 패널을 감싸는 영역 `mouseleave` → `none` | **`activated` ∧ `on`인 시간만.** 창이 비활성이거나 pause 중이면 구간이 닫히고, 조건이 회복되면 직전 상태로 다시 열린다 |

따라서 `panel` 구간의 합 = `reading:on`과 `window:activated`의 교집합 길이. e2e에서 `panel 합 == on 합`(창 비활성 없음)을 확인했다. `no_ai`에서는 AI 패널이 없으므로 `panel`은 `reading`/`none`만 나온다.

`window_*` point 이벤트와 `window` 스트림은 같은 정보의 두 표현이다(point는 전환 순간, interval은 구간). 분석에는 interval을 쓰는 편이 간단하다.

---

## 4. 세션 요약 — `users/{uid}/sessions/{sid}.reading`

읽기 종료 시 **1회** 저장되는 study2 방식 요약. §2 이벤트에서 파생되지만 별도로 저장되므로 함께 적어둔다.

| 필드 | 계산 |
|---|---|
| `startedAt`, `completedAt`, `totalDuration` | 팝업 확인 시각, 종료 시각, 그 차 (ms). pause 포함 |
| `focusTimes{reading, chat, audio, infographics, video}` | `focus_switch`·`resource_tab_switch`마다 직전 focus에 체류시간을 더한 누적 + 종료 시점의 마지막 구간 (ms) |
| `classificationSummary{reading, scanning, scrolling}` | `scroll_action`들의 `classification`별 `{count, totalDuration(pauseDuration 합)}` — 종료 시점의 마지막 논문 구간(§7 `isFinalSegment`)도 포함 |
| `externalToolUsage{usedExternalAi, usedExternalPdfViewer}` | 종료 팝업의 두 응답 (`'yes'`/`'no'`/`null`) |
| `resourcesUsed{infographics, video, audio, audioInteractions, videoInteractions, tabSwitchCount}` | 미디어 존재 여부(항상 true), 미디어 이벤트 수, 탭 전환 수 |
| `chatHistory[]` | 턴별 `{question, questionTime, answer, answerTime, responseTime}` + mm_cimo 컨텍스트 3필드 |
| `eventStorage: 'eventBatches'` | 이벤트 배열은 여기 없고 batch에 있다는 표시 |

`reading_phase_complete` 이벤트의 payload도 이 중 `duration, focusTimes, classificationSummary, externalToolUsage`를 담는다.

---

## 5. 분석 시 유의

- 시각은 모두 참여자 브라우저의 `Date.now()`(epoch ms). 서버 시각과 수십 ms 차이가 있을 수 있다.
- `sinceStart`의 0점 = `reading_start` = 시작 팝업 확인 시각. 로그인·동의 등 이전 단계는 포함되지 않는다.
- `t`와 payload의 `timestamp`는 같은 시계다. 후자는 study2 유산.
- `focus_switch`는 경계 넘기, `resource_tab_switch`는 패널 내 탭 이동 — 서로 다른 사건이다.
- `audio_pause`는 `audio_ended` 직전에 한 번 더 찍힌다(브라우저 동작).
- `panel` 스트림은 마우스 위치 기반이다. 마우스를 논문 위에 두고 AI 답변을 읽는 경우는 잡지 못한다.
- `truncatedByUnload: true` 구간은 종료가 아니라 창 닫힘이다. 해당 세션은 `window_closed_during_reading`이 있고 `reading_end`가 없다.

---

## 6. 저장되지 않는 것 (코드에 있지만 무시할 것)

| 항목 | 이유 |
|---|---|
| `reading_start_confirmed` (동의 체크) | 레코더 생성 전에 발생 |
| `reading_completed_redirecting` | 레코더 종료 후 발생 |
| `isFinalSegment: true`인 `scroll_action` / `llm_activity` / `resource_tab_switch` | 종료 시 메모리에만 만들어 `classificationSummary`·`focusTimes` 계산에 씀. batch에는 없음 |
| `text_selection` | 논문이 페이지 이미지라 텍스트 선택 불가 |
| 외부 스크롤 컨테이너의 `scroll_action`(시간 기반 분류의 스크롤 버전) | 현재 레이아웃에서 그 컨테이너는 스크롤되지 않음 |
| `reading_scroll` (페이지·섹션·위치) | 요청에 따라 제거 |
| `*_generation_*`, `socratic_*`, `reading_guide_shown` | 호출 경로 없음 (미디어 사전 제공 / 패널 비활성 / 레거시) |
| `localStorage.experimentEvents_aom` | 브라우저 로컬 백업. Firebase 아님 |

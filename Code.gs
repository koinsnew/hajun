/**
 * 하준아~ 영어랑 놀자! — 데이터·발음 API (Code.gs)
 *
 * 이제 화면(index.html)은 GitHub가 담당하고,
 * 이 스크립트는 진도 저장/불러오기와 AI 발음(TTS)만 담당한다.
 *
 * ★★ 하준이 진도 보존 ★★
 *   진도는 예전과 똑같은 스크립트 속성 'PHONICS_PROGRESS_V1' 에 저장된다.
 *   즉, 이 Code.gs 로 교체해도 하준이의 레벨·별·아이템은 그 자리에 그대로 있다.
 *   (같은 스크립트 프로젝트에서 Code.gs 내용만 바꾸면 저장소는 유지된다)
 *
 * ▶ 배포
 *   같은 스크립트 프로젝트에서 → 배포 관리 > (기존 배포) 편집 > 버전: 새 버전
 *   (이렇게 하면 /exec 주소가 그대로 유지되고 진도도 유지됨)
 *   처음이라면: 배포 > 새 배포 > 웹 앱
 *     - 실행: 나(본인)
 *     - 액세스 권한: 링크가 있는 모든 사용자
 *   나온 /exec 주소를 index.html 맨 위 GAS_URL 에 넣는다.
 *
 * ※ GitHub 페이지에서 이 API를 부를 수 있도록, POST는 Content-Type을
 *    text/plain 으로 보냅니다(프리플라이트 없이 동작). 응답은 JSON입니다.
 */

var PROP_KEY = 'PHONICS_PROGRESS_V1';   // ← 예전과 동일! 하준이 진도가 여기 있음

/* GET: ?action=... (JSONP — callback 파라미터가 있으면 감싸서 반환) */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || 'ping';
  var out;
  if (action === 'load')      out = getProgress();
  else if (action === 'ttsStatus') out = ttsStatus();
  else if (action === 'voices')    out = ttsVoices();
  else if (action === 'ocrStatus') out = { enabled: _hasOcrKey() };
  else if (action === 'ppMap')     out = { ok: true, map: _ppMap() };
  else if (action === 'hw')        out = { ok: true, hw: _hw() };
  else if (action === 'wr')        out = { ok: true, list: _wrRead() };
  else if (action === 'dead')      out = { ok: true, ids: Object.keys(_dead()) };
  else if (action === 'ping')      out = { ok: true };
  else out = { error: 'UNKNOWN_ACTION' };
  return _reply(out, p.callback);
}

/* POST: body 는 JSON 문자열 {action, ...}. (Content-Type: text/plain 로 옴) */
function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  var action = body.action;
  var out;
  if (action === 'save')       out = { ok: saveProgress(body.prog) };
  else if (action === 'reset') out = { ok: resetProgress() };
  else if (action === 'tts')   out = ttsSynth(body);
  else if (action === 'ocr')   out = ocrScan(body);
  else if (action === 'hangul') out = hangulPron(body);
  else if (action === 'word')   out = wordInfo(body);
  else if (action === 'trans')  out = transSentence(body);
  else if (action === 'hand')   out = handRead(body);
  else if (action === 'handList') out = handList(body);
  else if (action === 'ppSet')  out = ppSet(body);
  else if (action === 'hwSet')  out = hwSet(body);
  else if (action === 'wrAdd')  out = wrAdd(body);
  else if (action === 'report') out = bookReport(body);
  else if (action === 'kill')   out = killIds(body);
  else if (action === 'wrDel')  out = wrDel(body);
  else if (action === 'hwCheck') out = hwCheck(body);
  else if (action === 'imgPut') out = origPutImg(body);
  else if (action === 'imgGet') out = origGetImgs(body);
  else if (action === 'imgDel') out = origDelImgs(body);
  else out = { error: 'UNKNOWN_ACTION' };
  return _reply(out, null);
}

function _reply(obj, callback) {
  var txt = JSON.stringify(obj);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + txt + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(txt)
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===== 진도 저장소 (예전과 동일) ===== */
function _store() {
  try {
    var up = PropertiesService.getUserProperties();
    up.getProperty(PROP_KEY);
    return up;
  } catch (e) {
    return PropertiesService.getScriptProperties();
  }
}
function getProgress() {
  var raw = _store().getProperty(PROP_KEY);
  if (!raw) return { stars: {}, name: '', rate: 0.8 };
  try {
    var o = JSON.parse(raw);
    if (!o.stars) o.stars = {};
    o.pphoto = _ppMap();   // 선수 사진 목록은 따로 지킨 것을 넣어 준다
    _stripDead(o);         // 다른 기기에서 지운 것은 내려주지 않는다
    return o;
  } catch (e) {
    return { stars: {}, name: '', rate: 0.8 };
  }
}
function saveProgress(obj) {
  if (!obj || typeof obj !== 'object') return false;
  _stripDead(obj);                       // 지운 것은 다시 저장하지 않는다(옛 화면을 켜 둔 기기가 되살리지 못하게)
  _goneKeep(obj);                        // 지운 것의 별 보관함은 줄지 않게 지킨다
  var pm = _ppMap();                     // (처음이면 예전 목록을 먼저 옮겨 둔다)
  if (obj.pphoto) {                      // 선수 사진 목록은 진도와 따로 지킨다. 목록에 없는 레벨만 받아 둔다(옛 화면에서 넣은 사진)
    var add = false;
    for (var lv in obj.pphoto) { if (!pm[lv] && _origKeyOk(String(obj.pphoto[lv]))) { pm[lv] = obj.pphoto[lv]; add = true; } }
    if (add) PropertiesService.getScriptProperties().setProperty(PP_MAP_PROP, JSON.stringify(pm));
    delete obj.pphoto;
  }
  _store().setProperty(PROP_KEY, JSON.stringify(obj));
  return true;
}
function resetProgress() {
  _store().deleteProperty(PROP_KEY);
  return true;
}

/* ===== AI 발음 (Google Cloud Text-to-Speech) =====
 * 최초 1회: setTtsApiKey 의 'YOUR_KEY' 를 바꾸고 이 함수만 한 번 실행.
 * (예전에 이미 키를 넣었다면 그대로 유지되므로 다시 안 해도 됨)
 */
var TTS_PROP = 'TTS_API_KEY';
function setTtsApiKey() {
  var KEY = 'YOUR_KEY';   // ← 여기에 API 키를 붙여넣고 이 함수를 한 번 실행하세요
  PropertiesService.getScriptProperties().setProperty(TTS_PROP, KEY.trim());
  Logger.log('저장 완료. 이제 앱 설정에서 "AI 음성"을 켜세요.');
  return 'OK';
}
function clearTtsApiKey() {
  PropertiesService.getScriptProperties().deleteProperty(TTS_PROP);
  return 'OK';
}
function _ttsKey() { return PropertiesService.getScriptProperties().getProperty(TTS_PROP); }

function ttsStatus() {
  var k = _ttsKey(), cloud = !!(k && k !== 'YOUR_KEY'), gem = !cloud && _hasOcrKey();
  return { enabled: cloud || gem, gem: gem };   // gem = Cloud TTS 키 없이 Gemini 키로 읽는 중
}

function ttsVoices() {
  var k = _ttsKey();
  if (!k || k === 'YOUR_KEY') {
    if (_hasOcrKey()) return { gem: true, voices: GEM_TTS_VOICES.map(function (v) { return { name: v[0], g: v[1] }; }) };
    return { error: 'NO_KEY' };
  }
  var cache = CacheService.getScriptCache();
  var hit = cache.get('tts_voices');
  if (hit) return JSON.parse(hit);
  try {
    var r = UrlFetchApp.fetch(
      'https://texttospeech.googleapis.com/v1/voices?languageCode=en-US&key=' + encodeURIComponent(k),
      { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return { error: 'HTTP ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 200) };
    var vs = (JSON.parse(r.getContentText()).voices || []).filter(function (v) {
      return v.languageCodes.indexOf('en-US') >= 0;
    }).map(function (v) { return { name: v.name, g: v.ssmlGender }; });
    var out = { voices: vs };
    cache.put('tts_voices', JSON.stringify(out), 21600);
    return out;
  } catch (e) { return { error: String(e) }; }
}

function ttsSynth(req) {
  var k = _ttsKey();
  if (!k || k === 'YOUR_KEY') return _hasOcrKey() ? gemTts(req) : { error: 'NO_KEY' };
  var ssml  = String(req.ssml || '');
  var voice = req.voice || 'en-US-Neural2-F';
  var rate  = Number(req.rate) || 1.0;
  var marks = !!req.marks;
  if (!ssml) return { error: 'EMPTY' };

  var ck = 'tts_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, ssml + '|' + voice + '|' + rate + '|' + marks + '|' + (req.text || '')));
  var cache = CacheService.getScriptCache();
  var hit = cache.get(ck);
  if (hit) return JSON.parse(hit);

  var URL = 'https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=' + encodeURIComponent(k);
  function post(b) {
    return UrlFetchApp.fetch(URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify(b), muteHttpExceptions: true });
  }
  try {
    var out = null;
    /* 문장 목소리(Chirp3-HD): SSML·낱말 시각을 못 쓰므로 글(text)로 보낸다.
       빠르기를 못 받으면 빠르기 없이 한 번 더(rate:false → 앱이 재생 속도로 맞춘다). 그래도 안 되면 아래 기본 목소리로. */
    var text = String(req.text || '');
    if (text && /Chirp/i.test(voice)) {
      var nb = { input: { text: text }, voice: { languageCode: 'en-US', name: voice }, audioConfig: { audioEncoding: 'MP3', speakingRate: rate } };
      var nr = post(nb);
      if (nr.getResponseCode() === 200) out = { audio: JSON.parse(nr.getContentText()).audioContent, marks: [], nat: true };
      else {
        delete nb.audioConfig.speakingRate;
        nr = post(nb);
        if (nr.getResponseCode() === 200) out = { audio: JSON.parse(nr.getContentText()).audioContent, marks: [], nat: true, rate: false };
      }
      if (!out) voice = req.fb || 'en-US-Neural2-F';
    }
    if (!out) {
      var body = {
        input: { ssml: ssml },
        voice: { languageCode: 'en-US', name: voice },
        audioConfig: { audioEncoding: 'MP3', speakingRate: rate, pitch: 0, volumeGainDb: 0 }
      };
      if (marks) body.enableTimePointing = ['SSML_MARK'];
      var r = post(body);
      var code = r.getResponseCode(), txt = r.getContentText();
      if (code !== 200) return { error: 'HTTP ' + code + ' ' + txt.slice(0, 300) };
      var j = JSON.parse(txt);
      out = { audio: j.audioContent, marks: j.timepoints || [] };
    }
    try {
      var st = JSON.stringify(out);
      if (st.length < 95000) cache.put(ck, st, 21600);
    } catch (e) {}
    return out;
  } catch (e) { return { error: String(e) }; }
}


/* ===== 사진 읽기 (Google Gemini 비전) — 단어장·읽을 책·문장 만들기 자동 입력 =====
 *
 * ▶ 최초 1회 설정
 *   1) Google AI Studio(aistudio.google.com)에서 Gemini API 키를 만든다.
 *   2) 아래 setGeminiKey 의 'YOUR_KEY' 를 키로 바꾸고, 이 함수만 한 번 실행한다.
 *      (키는 스크립트 속성에 저장되며 GitHub 화면 파일에는 들어가지 않는다)
 *   3) 코드를 저장한 뒤 배포 관리 > 편집 > 새 버전으로 다시 배포한다.
 *
 * ▶ 조절 상수
 *   OCR_MODEL      사용할 Gemini 모델 (예: 'gemini-2.5-flash', 더 정확하게는 'gemini-2.5-pro')
 *   OCR_DAILY_MAX  하루 최대 호출 횟수 (남이 주소를 알아도 요금 폭탄 방지)
 */
var OCR_MODEL = 'gemini-2.5-flash';
var OCR_FALLBACK_MODEL = 'gemini-3.5-flash-lite';   // 기본 모델이 붐빌 때 대신 쓰는 모델
var OCR_DAILY_MAX = 60;
var OCR_KEY_PROP = 'GEMINI_API_KEY';
var OCR_PIN_PROP = 'OCR_PIN';          // 비워두면 index.html 의 DAD_PIN(기본 7084)과 비교

function setGeminiKey() {
  var KEY = 'YOUR_KEY';   // ← 여기에 API 키를 붙여넣고 이 함수를 한 번 실행하세요
  PropertiesService.getScriptProperties().setProperty(OCR_KEY_PROP, KEY.trim());
  Logger.log('저장 완료. 이제 앱에서 사진 첨부로 자동 입력을 쓸 수 있어요.');
  return 'OK';
}
function clearGeminiKey() {
  PropertiesService.getScriptProperties().deleteProperty(OCR_KEY_PROP);
  return 'OK';
}
function _ocrKey() { return PropertiesService.getScriptProperties().getProperty(OCR_KEY_PROP); }
function _hasOcrKey() { var k = _ocrKey(); return !!(k && k !== 'YOUR_KEY'); }

var OCR_PROMPTS = {
  diary:
    '아래 [학생이 쓴 글]은 한국 초등학교 3학년 학생이 손으로 쓴 영어 일기를 그대로 옮긴 것입니다. 선생님처럼 읽고 JSON으로만 답하세요.\n' +
    '형식: {"original":"학생이 쓴 그대로","fixed":"철자·문법만 고친 글","fixes":[{"from":"틀린 부분","to":"고친 부분","why":"이유"}],"count":문장수,' +
    '"checks":[{"rule":"기준 글 그대로","ok":true,"note":"한 줄 설명"}],"easy":"기준을 모두 지킨 쉬운 글","ko":"easy 의 한국어 뜻","praise":"칭찬 한마디"}\n' +
    '규칙: ① original 은 틀린 철자·대소문자까지 보이는 그대로 옮기고 절대 고치지 않는다. 날짜·제목 줄도 그대로. 문장(줄)마다 줄바꿈(\\n). ' +
    '② fixed 는 학생의 문장과 내용을 그대로 두고 철자·대소문자·문장부호·문법만 고친다. 문장을 새로 만들지 않는다. 문장마다 줄바꿈. ' +
    '③ fixes 는 고친 곳마다 하나(최대 15개). from·to 는 그 낱말이나 짧은 구절만. why 는 한국어로 초등 3학년이 알 수 있게 아주 짧게. 고칠 곳이 없으면 빈 배열. ' +
    '④ count 는 fixed 의 문장 수(날짜·제목 줄 제외). ' +
    '⑤ checks 는 아래 [기준]을 순서대로 하나씩, rule 은 기준 글 그대로. 학생이 쓴 글(fixed)이 그 기준을 지켰으면 ok:true. note 는 한국어 한 줄(예: "4문장이에요. 한 문장만 더!", "because 를 잘 썼어요"). ' +
    '⑥ easy 는 학생이 쓴 내용을 바탕으로 [기준]을 모두 지키도록 다시 쓴 글. 초등 3학년이 아는 아주 쉬운 낱말과 짧고 단순한 문장(한 문장 10낱말 안팎)만 쓴다. ' +
    '학생이 쓰지 않은 일을 지어내지 말고, 기준을 채우는 데 꼭 필요한 만큼만 자연스럽게 덧붙인다. 날짜·제목은 넣지 않는다. 문장마다 줄바꿈. ' +
    '⑦ ko 는 easy 를 문장마다 줄바꿈해 옮긴 쉬운 한국어. praise 는 학생이 잘한 점을 한국어로 한 문장. ' +
    '⑧ 영어 일기가 아니거나 글씨를 읽을 수 없으면 {"error":"UNREADABLE"} 만.',
  topic:
    '아래 [학생이 쓴 글]은 한국 초등학교 3학년 학생이 손으로 쓴 한글 글(주제 글쓰기)을 그대로 옮긴 것입니다. 선생님처럼 읽고 JSON으로만 답하세요.\n' +
    '형식: {"title":"제목(없으면 빈 문자열)","original":"학생이 쓴 그대로","fixed":"고친 글","fixes":[{"from":"틀린 부분","to":"고친 부분","why":"이유"}],' +
    '"awkward":[{"from":"어색한 문장","to":"다듬은 문장","why":"이유"}],"praise":"칭찬 한마디","tip":"다음에 더 잘 쓰는 방법 한 가지"}\n' +
    '규칙: ① original 은 틀린 맞춤법·띄어쓰기까지 보이는 그대로 옮기고 절대 고치지 않는다. 문단마다 줄바꿈(\\n). ' +
    '② fixed 는 학생의 생각·내용·말투를 그대로 두고, 틀린 맞춤법·띄어쓰기·문장부호를 고치고, 뜻이 잘 통하지 않거나 어색한 문장만 꼭 필요한 만큼 다듬는다. 새 내용을 보태지 않는다. 문단 줄바꿈 유지. ' +
    '③ fixes 는 맞춤법·띄어쓰기를 고친 곳마다 하나(최대 20개). from·to 는 그 낱말이나 짧은 구절만. ' +
    '④ awkward 는 어색해서 다듬은 문장마다 하나(최대 8개). 앞뒤가 맞지 않는 문장(예: "왜냐하면 ~ 재미있다" → "왜냐하면 ~ 재미있기 때문이다"), 너무 길게 이어진 문장, 같은 말이 되풀이되는 문장, 뜻이 흐린 문장을 찾는다. 없으면 빈 배열. ' +
    '⑤ why·praise·tip 은 초등 3학년이 알 수 있는 쉬운 말로 짧게. ' +
    '⑥ 한글 글이 아니거나 글씨를 읽을 수 없으면 {"error":"UNREADABLE"} 만.',
  report:
    '첫 이미지는 영어 원서를 읽고 쓰는 Book Report 학습지 사진입니다(Title 칸에 책 제목이 손글씨로 적혀 있을 수 있음). 그 뒤의 이미지가 있으면 그 책의 본문 사진입니다. ' +
    '한국 초등학교 3학년 학생이 빈칸에 따라 쓸 수 있도록, 학습지의 빈칸을 아주 쉬운 영어로 채워 JSON으로만 답하세요.\n' +
    '형식: {"paperTitle":"학습지 Title 칸에 손으로 적힌 글자 그대로(비어 있으면 빈 문자열)","title":"책 제목","src":"pages 또는 memory","blanks":[{"q":"칸 제목 그대로","pre":"빈칸 앞에 인쇄된 글","post":"빈칸 뒤에 인쇄된 글","answer":"빈칸에 쓸 말","ko":"완성된 문장의 한국어 뜻"}],' +
    '"summary":["문장1","문장2"],"summaryKo":"summary 의 한국어 뜻(문장마다 줄바꿈)"}\n' +
    '규칙: ① title 은 학습지 Title 칸에 손으로 적힌 제목, 없으면 아래 [책 제목]. 둘 다 없으면 {"error":"NO_TITLE"} 만 — 학습지에 인쇄된 낱말(예: Maisy)만 보고 제목을 짐작하지 않는다. 철자가 조금 틀렸으면 바른 책 제목으로 고친다. ' +
    '② 학습지에 인쇄된 칸을 위에서 아래 순서대로 하나씩 blanks 에 담는다(Title 칸과 SUMMARY 칸은 제외). q 는 칸 제목 그대로(예: "WHO (Who is in the story?)"). ' +
    '한 칸에 빈 줄이 두 개면(예: "Maisy ____" 와 "because ____") 줄마다 따로 담고 q 는 같은 제목을 쓴다. ' +
    '③ pre·post 는 그 줄에 이미 인쇄된 글 그대로(없으면 빈 문자열). answer 에는 빈칸에 쓸 말만 넣고 pre·post 의 글을 되풀이하지 않는다. pre + answer + post 를 이으면 문법이 맞는 한 문장이 되어야 한다. 문장 끝이면 answer 에 마침표를 넣는다. ' +
    '④ answer 는 초등 3학년이 아는 아주 쉬운 낱말로 짧게(10낱말 이내). 어려운 낱말·긴 문장·관계사절은 쓰지 않는다. ' +
    '⑤ SUMMARY 칸이 있으면 summary 에 이야기 줄거리를 아주 쉬운 짧은 문장 4~5개로(한 문장 8낱말 안팎, 처음-가운데-끝 순서). 없으면 빈 배열. ' +
    '⑥ 책 본문 사진이 있으면 그 내용만 근거로 채우고 src 는 "pages". 없으면 제목으로 알고 있는 그 책의 실제 내용으로 채우고 src 는 "memory". ' +
    '⑦ 본문 사진이 없고 그 책의 내용을 확실히 모르면 지어내지 말고 {"error":"UNKNOWN_BOOK","title":"읽은 제목"} 만. ' +
    '⑧ 학생이 이미 써 놓은 글이 있어도 무시하고 바른 답을 채운다. ko·summaryKo 는 쉬운 한국어. ' +
    '⑨ Book Report 학습지가 아니거나 읽을 수 없으면 {"error":"UNREADABLE"} 만.',
  hw:
    '이미지는 영어 학원 선생님이 올린 숙제 안내 글(메신저/밴드 화면)입니다. 숙제 항목을 읽어 JSON으로만 답하세요.\n' +
    '형식: {"title":"글 제목(예: 11/12 숙제)","items":[{"t":"숙제 내용","due":"11/17","how":"내는 방법","note":"딸린 설명"}],"notice":["번호 없는 안내 문장"]}\n' +
    '규칙: ① 번호가 붙은 줄 하나가 항목 하나. t는 번호와 화살표(=>) 앞의 숙제 내용만 그대로. ' +
    '② due는 화살표 뒤의 날짜를 월/일(예: 11/17)로. 날짜가 없으면 빈 문자열. ' +
    '③ how는 날짜 뒤의 내는 방법(예: 다음 시간까지, 밴드에 영상 업로드, 개인 카톡으로 영상 전송). 없으면 빈 문자열. ' +
    '④ note는 그 항목 바로 아래에 딸린 보충 설명 줄(책 이름, 쓰는 조건 등)을 한 줄로. 없으면 빈 문자열. ' +
    '⑤ notice에는 번호가 없는 안내 문장(준비물, 시험 예고, 주의 사항)을 문장별로. 인사말·작성자·시간·읽음 수·댓글 칸은 넣지 마세요. ' +
    '⑥ 글자는 이미지 그대로 옮기고 지어내지 마세요. 여러 이미지는 순서대로 이어서 하나의 items에 담으세요.',
  quiz:
    '이미지는 영어 단어 학습지/단어장 사진입니다. 각 문제 항목을 읽어 JSON으로만 답하세요.\n' +
    '형식: {"title":"단어장 이름 추정(없으면 빈 문자열)","items":[{"def":"English definition(영어 뜻풀이 문장)","w":"정답 영어 단어","k":"한글 뜻"}]}\n' +
    '규칙: def는 이미지에 있는 영어 뜻풀이를 그대로, w는 그 뜻풀이의 정답 단어(소문자), k는 이미지에 한글 뜻이 있으면 그대로, ' +
    '없으면 초등학생용 짧은 한글 뜻을 직접 쓰세요. 이미지에 없는 항목을 지어내지 말고 읽을 수 없으면 빼세요. 여러 이미지는 순서대로 이어서 하나의 items에 담으세요.',
  vocab:
    '이미지는 영어 단어·숙어와 그 한글 뜻이 적힌 목록(단어장·학습지)입니다. 위에서 아래 순서대로 읽어 JSON으로만 답하세요.\n' +
    '형식: {"title":"목록 이름 추정(없으면 빈 문자열)","items":[{"en":"영어 단어 또는 숙어","ko":"한글 뜻"}]}\n' +
    '규칙: ① 한 항목 = 영어 표현 하나와 그 뜻. 순서는 이미지에 적힌 그대로(번호가 있으면 번호 순), 번호는 빼고 담는다. ' +
    '② en 은 이미지에 적힌 그대로(오탈자 고치지 말 것, 숙어의 ~ 나 one\'s 같은 표기도 그대로). ' +
    '③ ko 는 이미지에 적힌 한글 뜻 그대로. 이미지에 뜻이 없을 때만 초등학생 눈높이의 짧은 뜻을 채운다. ' +
    '④ 예문·발음기호·품사 표시·쪽번호는 담지 않는다. 이미지에 없는 항목을 지어내지 않는다. 여러 이미지는 순서대로 이어서 담는다.',
  sblank:
    '이미지는 영어 원서 총괄 테스트의 「문장 빈칸 채우기」 문제지입니다. 위에서 아래 순서대로 읽어 JSON으로만 답하세요.\n' +
    '형식: {"title":"문제지 제목(없으면 빈 문자열)","bank":["보기 단어(문제지에 보기 상자가 있을 때만)"],"items":[{"s":"빈칸을 ___ 로 표시한 문장","a":"빈칸의 정답","ko":"정답을 넣은 문장의 쉬운 한국어 뜻"}],"guessed":true 또는 false}\n' +
    '규칙: ① 한 항목 = 빈칸 하나. 한 문장에 빈칸이 둘 이상이면 빈칸마다 항목을 따로 만들고, 그 항목의 다른 빈칸은 정답으로 채워 둔다. ' +
    '② s 는 문장을 이미지에 인쇄된 그대로 옮기되 빈칸 자리(밑줄·괄호·네모)만 ___ 로 바꾼다. 문제 번호는 뺀다. 첫 글자 힌트가 인쇄돼 있으면(예: b___) 그 글자도 그대로 둔다. ' +
    '③ a 는 빈칸에 들어갈 정답(단어나 짧은 말). 문제지나 답란에 정답이 적혀 있으면 그것을 쓴다(학생이 쓴 답은 틀릴 수 있으니 문장과 보기를 보고 바른 답을 쓴다). 정답이 없으면 보기 단어와 문장 뜻으로 가장 알맞은 답을 정하고 guessed 를 true 로. ' +
    '④ 정답은 초등학생 원서 수준의 바른 영어 철자로, 문장의 시제·수에 맞게. ⑤ 빈칸이 없는 문장(지문·예시·제목)은 담지 않는다. 이미지에 없는 문제를 지어내지 않는다. 여러 이미지는 순서대로 이어서 담는다.',
  sent:
    '이미지는 영어 문장이 담긴 교재/학습지 사진입니다. 영어 문장을 읽고 JSON으로만 답하세요.\n' +
    '형식: {"title":"이름 추정(없으면 빈 문자열)","items":[{"en":"English sentence","ko":"자연스러운 한글 해석"}]}\n' +
    '규칙: 문장은 이미지 그대로(오탈자 고치지 말 것), 문장 하나가 한 항목. 한글 해석이 이미지에 있으면 그것을 쓰고 없으면 초등학생 눈높이로 번역. ' +
    '이미지에 없는 문장을 지어내지 마세요. 여러 이미지는 순서대로 이어서 담으세요.',
  pbook:
    '이미지는 영어 그림책(원서)의 쪽을 순서대로 찍은 사진입니다. 이미지 하나가 책의 한 쪽(또는 한 장면)이고, 순서는 [이미지 1], [이미지 2]… 입니다. JSON으로만 답하세요.\n' +
    '형식: {"title":"책 제목(표지에 보이면, 없으면 빈 문자열)","by":"지은이/출판사(보이면)","pages":["[이미지 1]의 영어 본문","[이미지 2]의 영어 본문"]}\n' +
    '규칙: ① pages 의 칸 수는 이미지 수와 정확히 같아야 한다. 이미지마다 한 칸, 순서 그대로. ' +
    '② 각 칸에는 그 이미지에 보이는 영어 본문 문장을 읽는 순서대로 모두 이어서 쓴다(펼침면이면 왼쪽 쪽 다음 오른쪽 쪽). 쪽번호·출판 정보·그림 속 낙서는 제외. ' +
    '③ 글이 없는 이미지(그림만)는 빈 문자열 "". 표지 이미지도 한 칸을 차지하며 그 칸에는 책 제목만 쓴다. ' +
    '④ 글자는 보이는 그대로 옮기고, 읽을 수 없는 글자는 추측하지 말고 가능한 만큼만.',
  paper:
    '이미지는 영어 그림책/종이책 사진입니다. 이미지 한 장은 한 쪽 또는 펼침면(두 쪽)입니다. JSON으로만 답하세요.\n' +
    '형식: {"title":"책 제목(표지에 보이면, 없으면 빈 문자열)","by":"지은이/출판사(보이면)","pages":["1쪽 영어 본문","2쪽 영어 본문"]}\n' +
    '규칙: pages는 쪽 순서대로. 펼침면이면 왼쪽 쪽, 오른쪽 쪽으로 나눠 각각 한 칸. 본문 영어 문장만 쓰고 쪽번호·그림 속 낙서는 제외. ' +
    '글이 없는 쪽(그림만)은 빈 문자열. 표지 이미지는 pages에 넣지 말고 title/by에만 반영. 읽을 수 없는 글자는 추측하지 말고 가능한 만큼만.',
  orig:
    '이미지는 영어 원서(그림책) PDF의 쪽을 찍은 것입니다. 이미지 하나가 한 쪽이고, 순서는 [이미지 1], [이미지 2]… 입니다. JSON으로만 답하세요.\n' +
    '형식: {"items":[{"page":1,"box":[ymin,xmin,ymax,xmax],"en":"그림 아래 영어 문장","ko":"한글 해석"}]}\n' +
    '규칙: ① 그림(일러스트/사진)과 그 그림에 딸린 영어 문장이 있는 곳마다 항목 하나. 한 쪽에 그림이 여러 개면 읽는 순서대로 여러 항목. ' +
    '② page는 [이미지 N]의 N(1부터). ③ box는 그림만 감싸는 사각형이며 좌표는 그 이미지의 가로·세로를 각각 0~1000으로 본 값, 순서는 [ymin,xmin,ymax,xmax]. ' +
    '글자(영어 문장, 쪽번호)는 box 밖에 두고, 그림 테두리까지만 딱 맞게 잡으세요. 글자가 그림 위에 겹쳐 있어도 그림 전체 영역을 잡으세요. ' +
    '④ en은 그 그림 아래(또는 곁)의 영어 문장을 이미지 그대로(오탈자 고치지 말 것) 적고, 여러 줄이면 한 문장으로 이어 쓰세요. 쪽번호·출판사 표기는 제외. ' +
    '⑤ ko는 en의 자연스러운 한글 해석(초등학교 3학년이 이해할 쉬운 말). 항상 채우세요. ' +
    '⑥ 표지, 제목지, 판권지, 글자만 있는 쪽, 그림만 있고 영어 문장이 없는 쪽은 items에 넣지 마세요. 이미지에 없는 문장을 지어내지 마세요.'
};

function ocrScan(req) {
  if (!_hasOcrKey()) return { error: 'NO_KEY' };
  var pinWant = PropertiesService.getScriptProperties().getProperty(OCR_PIN_PROP) || '7084';
  if (String(req.pin || '') !== pinWant) return { error: 'BAD_PIN' };
  var kind = req.kind;
  if (!OCR_PROMPTS[kind]) return { error: 'BAD_KIND' };
  var imgs = (req.images || []).slice(0, 10);
  if (!imgs.length) return { error: 'NO_IMAGE' };

  // 하루 호출 상한
  var sp = PropertiesService.getScriptProperties();
  var dayKey = 'OCR_N_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
  var n = Number(sp.getProperty(dayKey) || 0);
  if (n >= OCR_DAILY_MAX) return { error: 'DAILY_LIMIT' };
  sp.setProperty(dayKey, String(n + 1));

  var parts = [];
  imgs.forEach(function (b64, i) {
    parts.push({ text: '[이미지 ' + (i + 1) + ']' });
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: String(b64) } });
  });
  /* 글쓰기(영어일기·주제글쓰기)는 두 번에 나눠 한다: ① 쓴 그대로 옮겨 적기 → ② 그 글을 고치기.
     한 번에 시키면 옮겨 적을 때 벌써 고쳐 버려서, 아이가 실제로 틀린 곳을 놓친다. */
  if (kind === 'diary' || kind === 'topic') {
    parts.push({ text: WR_READ_PROMPT[kind] });
    var g1 = _geminiJSON(parts, 4000);
    if (!g1.ok) return { error: g1.error };
    var d1 = g1.data || {};
    if (d1.items && d1.items.length) d1 = d1.items[0] || {};
    var text = String(d1.text || '').trim();
    if (d1.error || !text) return { ok: true, data: { error: 'UNREADABLE' }, model: g1.model };
    var g2 = _geminiJSON([{ text: OCR_PROMPTS[kind] + (kind === 'diary' ? _wrRules(req.rules) : '') + '\n[학생이 쓴 글]\n' + text }], 8000);
    if (!g2.ok) return { error: g2.error };
    var d2 = g2.data || {};
    if (d2.items && d2.items.length && !d2.fixed) d2 = d2.items[0] || {};
    d2.original = text;
    return { ok: true, data: d2, model: g2.model };
  }
  parts.push({ text: OCR_PROMPTS[kind] + (kind === 'report' ? '\n[책 제목] ' + (String(req.title || '').replace(/[\r\n]+/g, ' ').slice(0, 120) || '(따로 적지 않음)') : '') });

  var g = _geminiJSON(parts, 8000);
  if (!g.ok) return { error: g.error };
  if (kind === 'pbook' && g.data && typeof g.data === 'object') {   // 쪽 글의 칸 수를 이미지 수에 맞춘다
    var pd = g.data;
    if (pd.items && pd.items.length && !pd.pages) pd = pd.items[0] || {};
    var pg = (pd.pages || []).map(function (x) { return String(x == null ? '' : x); }).slice(0, imgs.length);
    while (pg.length < imgs.length) pg.push('');
    return { ok: true, data: { title: String(pd.title || ''), by: String(pd.by || ''), pages: pg }, model: g.model };
  }
  if (kind === 'report' && g.data && typeof g.data === 'object') {
    var rd = g.data;
    if (rd.items && rd.items.length && !rd.blanks) rd = rd.items[0] || {};
    /* 제목이 종이에도 없고 따로 적지도 않았으면 채우지 않는다(지어낸 책으로 채우는 것을 막는다) */
    if (!rd.error && !String(rd.paperTitle || '').trim() && !String(req.title || '').trim()) rd = { error: 'NO_TITLE' };
    if (!rd.error) rd.src = imgs.length > 1 ? 'pages' : 'memory';
    return { ok: true, data: rd, model: g.model };
  }
  return { ok: true, data: g.data, model: g.model };
}


/* 모델 답변에서 JSON 하나를 꺼낸다 — 코드블록(```)·앞뒤 설명·배열/객체 모두 견딘다. 못 읽으면 null */
function _extractJson(text) {
  var t = String(text || '').replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch (e) { /* 아래에서 바깥 덩어리만 잘라 본다 */ }
  var i = t.search(/[\[{]/);
  if (i < 0) return null;
  var open = t.charAt(i), close = open === '{' ? '}' : ']', depth = 0, inStr = false, esc = false;
  for (var k = i; k < t.length; k++) {
    var c = t.charAt(k);
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) { try { return JSON.parse(t.slice(i, k + 1)); } catch (e2) { return null; } }
    }
  }
  return null;
}

/* 구글 Gemini 호출 (공통) — JSON 응답을 받는다.
   구글 쪽이 일시적으로 붐비면(503/429/500/504) 잠깐 쉬고 다시, 그래도 안 되면 예비 모델로 시도한다. */
function _geminiJSON(parts, maxTokens) {
  var payload = JSON.stringify({
    contents: [{ role: 'user', parts: parts }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: maxTokens || 8000 }
  });
  var plan = [OCR_MODEL, OCR_MODEL, OCR_FALLBACK_MODEL, OCR_FALLBACK_MODEL];
  var lastErr = '';
  try {
    for (var t = 0; t < plan.length; t++) {
      if (t > 0) Utilities.sleep(t === 1 ? 2000 : 1500);
      var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + plan[t] + ':generateContent', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { 'x-goog-api-key': _ocrKey() }, payload: payload
      });
      var code = r.getResponseCode(), txt = r.getContentText();
      if (code === 503 || code === 429 || code === 500 || code === 504 || code === 404) { lastErr = 'HTTP ' + code + ' ' + plan[t]; continue; }   // 404 = 그 모델이 사라짐 → 다음 모델로
      if (code !== 200) return { error: 'HTTP ' + code + ' ' + txt.slice(0, 300) };
      var j = JSON.parse(txt);
      var cand = (j.candidates || [])[0];
      var text = cand && cand.content && cand.content.parts
        ? cand.content.parts.map(function (p) { return p.thought ? '' : (p.text || ''); }).join('') : '';
      if (!text) { lastErr = 'EMPTY ' + (cand && cand.finishReason || ''); continue; }
      var data = _extractJson(text);
      if (data === null) { lastErr = 'PARSE'; continue; }          // 읽을 수 없으면 다시/다른 모델로
      if (Array.isArray(data)) data = { items: data };            // 예비 모델은 {items:[…]} 대신 […] 로 답하기도 한다
      return { ok: true, data: data, model: plan[t] };
    }
    return { error: 'BUSY ' + lastErr };
  } catch (e) { return { error: String(e) }; }
}

/* ===== 한글 발음 (Gemini) — 영어 문장을 실제 미국식 소리대로 한글로 =====
 * 조절 상수: HANGUL_DAILY_MAX (하루 호출 상한, 사진 읽기와 따로 센다)
 * 같은 문장은 6시간 동안 서버 캐시에서 바로 돌려준다. (앱 쪽은 진도에 저장해서 다시 안 부른다)
 */
var HANGUL_DAILY_MAX = 300;
var HANGUL_PROMPT =
  '너는 한국 초등학생(3학년)에게 영어 읽기를 도와주는 선생님이다.\n' +
  '아래 JSON 배열의 영어 문장들을 미국 원어민이 실제로 자연스럽게 읽는 소리 그대로 한글로 적어라.\n' +
  '규칙:\n' +
  '- 영어 단어마다 띄어 써서 영어 단어 순서와 1:1로 맞춘다 (영어 단어 수 = 한글 덩어리 수).\n' +
  '- 철자가 아니라 실제 소리: 묵음은 쓰지 않는다(knife→나이프, write→롸잇, know→노우). 약하게 읽는 a/the/to/of는 실제처럼(어, 더, 투, 어브).\n' +
  '- 이중모음은 살린다(go→고우, so→쏘우, make→메익, like→라익, day→데이).\n' +
  '- 미국식: water→워러, little→리를, better→베러 (t가 굴러가는 소리). r은 ㄹ(필요하면 롸·뤠), f는 ㅍ, v는 ㅂ, th는 ㅆ 또는 ㄷ 중 실제에 가까운 것, z는 ㅈ.\n' +
  '- 끝소리는 받침으로 짧게(cat→캣, book→북, went→웬트), 끝 s/z는 스/즈.\n' +
  '- 사람 이름·고유명사도 실제 소리대로(Maisy→메이지).\n' +
  '- 문장부호는 그대로 두고, 설명은 붙이지 않는다.\n' +
  '- 입력 문장 수와 출력 개수를 정확히 같게, 같은 순서로.\n' +
  'JSON으로만 답: {"lines":["한글 발음1","한글 발음2"]}\n문장들:\n';

function hangulPron(req) {
  if (!_hasOcrKey()) return { error: 'NO_KEY' };
  var pinWant = PropertiesService.getScriptProperties().getProperty(OCR_PIN_PROP) || '7084';
  if (String(req.pin || '') !== pinWant) return { error: 'BAD_PIN' };
  var lines = (req.lines || []).map(function (x) { return String(x || '').trim(); }).slice(0, 60);
  if (!lines.length) return { ok: true, lines: [] };

  var cache = CacheService.getScriptCache();
  function ck(t) { return 'hg_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, t)); }
  var out = lines.map(function (t) { return t ? (cache.get(ck(t)) || null) : ''; });
  var need = [];
  lines.forEach(function (t, i) { if (out[i] === null) need.push(i); });
  if (!need.length) return { ok: true, lines: out };

  var sp = PropertiesService.getScriptProperties();
  var dayKey = 'HG_N_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
  var n = Number(sp.getProperty(dayKey) || 0);
  if (n >= HANGUL_DAILY_MAX) return { error: 'DAILY_LIMIT' };
  sp.setProperty(dayKey, String(n + 1));

  var ask = need.map(function (i) { return lines[i]; });
  var g = _geminiJSON([{ text: HANGUL_PROMPT + JSON.stringify(ask) }], 4000);
  if (!g.ok) return { error: g.error };
  var got = (g.data && g.data.lines) || [];
  if (got.length !== ask.length) return { error: 'COUNT_MISMATCH' };
  need.forEach(function (i, k) {
    var v = String(got[k] || '').trim();
    out[i] = v;
    if (v) { try { cache.put(ck(lines[i]), v, 21600); } catch (e) {} }
  });
  return { ok: true, lines: out, model: g.model };
}

/* ===== 단어 한 개 — 한글 발음 + 한글 뜻 (Gemini) =====
 * 앱에서 모르는 단어를 눌렀을 때 쓴다. 뜻은 그 단어가 들어 있는 문장(ctx)에 맞는 뜻으로 고른다.
 * 같은 단어+문장은 6시간 동안 서버 캐시에서 바로 돌려준다. (하루 상한은 HANGUL_DAILY_MAX 와 함께 센다)
 */
var WORD_PROMPT =
  '너는 한국 초등학생(3학년)에게 영어를 가르치는 선생님이다.\n' +
  '아래 영어 단어(word)가 문장(context) 안에서 쓰인 뜻에 맞춰 두 가지를 JSON으로만 답하라.\n' +
  '- p: 미국 원어민이 실제로 읽는 소리를 한글로. 규칙: 완성된 한글 글자(가나다…)만 쓴다. 낱자(ㅅ, ㅏ 같은 자음·모음 단독 글자)와 영어·기호는 절대 쓰지 않는다. ' +
  '철자가 아닌 실제 소리(묵음 쓰지 않기: knife→나이프, write→롸잇). 끝소리는 받침 또는 스·트·크 등으로 자연스럽게 적는다(cat→캣, sat→쌧, bat→뱃, book→북, went→웬트, tooth→투쓰). ' +
  '미국식(water→워러, little→리를). 사람 이름도 실제 소리대로(Maisy→메이지).\n' +
  '- m: 이 문장에서의 뜻을 초등학생이 아는 쉬운 한국어 1~3단어로 (예: cat→고양이, sat→앉았다(sit의 과거), on→~위에). 동사 변화형이면 원형도 괄호로. 이름이면 "사람 이름".\n' +
  '형식: {"p":"한글 발음","m":"한글 뜻"}\n';

function wordInfo(req) {
  if (!_hasOcrKey()) return { error: 'NO_KEY' };
  var pinWant = PropertiesService.getScriptProperties().getProperty(OCR_PIN_PROP) || '7084';
  if (String(req.pin || '') !== pinWant) return { error: 'BAD_PIN' };
  var word = String(req.word || '').replace(/[^A-Za-z']/g, '').slice(0, 40);
  if (!word) return { error: 'EMPTY' };
  var ctx = String(req.ctx || '').replace(/\s+/g, ' ').trim().slice(0, 300);

  var cache = CacheService.getScriptCache();
  var ck = 'wd_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, word + '|' + ctx));
  var hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  var sp = PropertiesService.getScriptProperties();
  var dayKey = 'HG_N_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
  var n = Number(sp.getProperty(dayKey) || 0);
  if (n >= HANGUL_DAILY_MAX) return { error: 'DAILY_LIMIT' };
  sp.setProperty(dayKey, String(n + 1));

  var g = _geminiJSON([{ text: WORD_PROMPT + 'word: ' + word + '\ncontext: ' + (ctx || word) }], 1000);
  if (!g.ok) return { error: g.error };
  var p = String((g.data && g.data.p) || '').trim(), m = String((g.data && g.data.m) || '').trim();
  if (!p) return { error: 'EMPTY_RESULT' };
  // 낱자(ㅅ 등)나 영어가 섞여 있으면 한 번 더 시도한다
  if (/[ㄱ-ㅣA-Za-z]/.test(p)) {
    var g2 = _geminiJSON([{ text: WORD_PROMPT + 'word: ' + word + '\ncontext: ' + (ctx || word) + '\n(주의: 완성된 한글 글자만 써서 다시 답하라)' }], 1000);
    if (g2.ok && g2.data && g2.data.p && !/[ㄱ-ㅣA-Za-z]/.test(String(g2.data.p))) { p = String(g2.data.p).trim(); if (g2.data.m) m = String(g2.data.m).trim(); g.model = g2.model; }
    else return { error: 'BAD_PRON' };
  }
  var out = { ok: true, p: p, m: m, model: g.model };
  try { cache.put(ck, JSON.stringify(out), 21600); } catch (e) {}
  return out;
}

/* ===== 영어 문장 → 한글 해석 (Gemini) =====
 * 단어 테스트에서 [문장 보기]를 누르면 뜻풀이 문장의 한글 해석을 보여주는 데 쓴다.
 * 같은 문장은 6시간 서버 캐시 + 앱 쪽(문제 데이터)에 저장해서 다시 안 부른다. (하루 상한은 HANGUL_DAILY_MAX 와 함께 센다)
 */
var TRANS_PROMPT =
  '너는 한국 초등학생(3학년)에게 영어를 가르치는 선생님이다.\n' +
  '아래 영어 문장(뜻풀이)을 초등학생이 이해하기 쉬운 자연스러운 한국어 한두 문장으로 해석하라. 직역투를 피하고, 설명을 덧붙이지 말 것.\n' +
  'JSON으로만 답: {"ko":"한글 해석"}\n문장: ';

function transSentence(req) {
  if (!_hasOcrKey()) return { error: 'NO_KEY' };
  var pinWant = PropertiesService.getScriptProperties().getProperty(OCR_PIN_PROP) || '7084';
  if (String(req.pin || '') !== pinWant) return { error: 'BAD_PIN' };
  var text = String(req.text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!text) return { error: 'EMPTY' };

  var cache = CacheService.getScriptCache();
  var ck = 'tr_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text));
  var hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  var sp = PropertiesService.getScriptProperties();
  var dayKey = 'HG_N_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
  var n = Number(sp.getProperty(dayKey) || 0);
  if (n >= HANGUL_DAILY_MAX) return { error: 'DAILY_LIMIT' };
  sp.setProperty(dayKey, String(n + 1));

  var g = _geminiJSON([{ text: TRANS_PROMPT + text }], 1000);
  if (!g.ok) return { error: g.error };
  var ko = String((g.data && g.data.ko) || '').trim();
  if (!ko) return { error: 'EMPTY_RESULT' };
  var out = { ok: true, ko: ko, model: g.model };
  try { cache.put(ck, JSON.stringify(out), 21600); } catch (e) {}
  return out;
}


/* ===== 원서 테스트 그림 — 구글 드라이브에 저장해서 모든 기기에서 보이게 =====
 * 처음 한 번: 앱스스크립트 편집기에서 위쪽 함수 선택칸을 authorizeDrive 로 바꾸고 ▶ 실행 →
 *            「권한 검토」→ 내 계정 → 허용. (드라이브 권한을 한 번 주는 과정입니다)
 *            그 다음 배포 > 배포 관리 > 새 버전 으로 올려 주세요.
 * 그림은 내 드라이브의 '하준 원서 그림' 폴더에 파일 이름 = 그림 키(o_...)로 저장됩니다.
 * 조절 상수: ORIG_IMG_MAX_B64 (그림 한 장 최대 크기, base64 글자 수)
 */
var ORIG_FOLDER_PROP = 'ORIG_FOLDER_ID';
var ORIG_FOLDER_NAME = '하준 원서 그림';
var ORIG_IMG_MAX_B64 = 2500000;   // 약 1.8MB

function _origFolder(create) {
  var sp = PropertiesService.getScriptProperties();
  var id = sp.getProperty(ORIG_FOLDER_PROP);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* 폴더가 지워졌으면 아래에서 새로 */ } }
  if (!create) return null;
  var f = DriveApp.createFolder(ORIG_FOLDER_NAME);
  sp.setProperty(ORIG_FOLDER_PROP, f.getId());
  return f;
}
function authorizeDrive() { var f = _origFolder(true); return 'OK ' + f.getId(); }

function _origKeyOk(k) { return /^o_[A-Za-z0-9_-]{3,90}$/.test(String(k || '')); }
function _pinOk(req) {
  var want = PropertiesService.getScriptProperties().getProperty(OCR_PIN_PROP) || '7084';
  return String(req.pin || '') === want;
}

function origPutImg(req) {
  if (!_pinOk(req)) return { error: 'BAD_PIN' };
  var key = String(req.key || '');
  if (!_origKeyOk(key)) return { error: 'BAD_KEY' };
  var data = String(req.data || '').replace(/^data:image\/jpeg;base64,/, '');
  if (!data || data.length > ORIG_IMG_MAX_B64) return { error: 'BAD_IMAGE' };
  try {
    var f = _origFolder(true);
    var old = f.getFilesByName(key);
    while (old.hasNext()) old.next().setTrashed(true);
    f.createFile(Utilities.newBlob(Utilities.base64Decode(data), 'image/jpeg', key));
    return { ok: true };
  } catch (e) { return { error: 'DRIVE ' + String(e).slice(0, 200) }; }
}

function origGetImgs(req) {
  var keys = (req.keys || []).slice(0, 8), out = {};
  try {
    var f = _origFolder(false);
    if (!f) return { ok: true, imgs: out };
    keys.forEach(function (k) {
      if (!_origKeyOk(k)) return;
      var it = f.getFilesByName(k);
      if (it.hasNext()) out[k] = 'data:image/jpeg;base64,' + Utilities.base64Encode(it.next().getBlob().getBytes());
    });
    return { ok: true, imgs: out };
  } catch (e) { return { error: 'DRIVE ' + String(e).slice(0, 200) }; }
}

function origDelImgs(req) {
  if (!_pinOk(req)) return { error: 'BAD_PIN' };
  var keys = (req.keys || []).slice(0, 60), n = 0;
  try {
    var f = _origFolder(false);
    if (!f) return { ok: true, n: 0 };
    keys.forEach(function (k) {
      if (!_origKeyOk(k)) return;
      var it = f.getFilesByName(k);
      while (it.hasNext()) { it.next().setTrashed(true); n++; }
    });
    return { ok: true, n: n };
  } catch (e) { return { error: 'DRIVE ' + String(e).slice(0, 200) }; }
}

/* ===== ✏️ 손글씨 읽기 (단어 테스트 펜 입력) =====
   req.images = [{lang:'en'|'ko', b64:'JPEG base64'}, …] (최대 2장) → { ok, en, ko }
   아이가 쓴 그대로 읽는다 — 철자를 고치지 않는다(채점이 정확해야 하니까). */
var HAND_DAILY_MAX = 500;   // 하루 손글씨 읽기 상한
var HAND_PROMPT =
  '위 이미지는 초등학생이 손가락이나 펜으로 화면에 쓴 손글씨다.\n' +
  '각 이미지 앞의 표시대로 [영어]는 영어 단어나 짧은 문장, [한글]은 한국어 낱말이나 짧은 말이다.\n' +
  '규칙:\n' +
  '1) 보이는 글자를 그대로 읽는다. 철자가 틀렸어도 절대 고치거나 추측해서 바꾸지 않는다.\n' +
  '2) 영어는 알파벳(대소문자 구분 없이 소문자로)·띄어쓰기·아포스트로피만, 한글은 한글·띄어쓰기만 적는다.\n' +
  '3) 글자가 없거나 전혀 못 읽겠으면 빈 문자열.\n' +
  '4) 반드시 JSON 하나만: {"en":"영어 이미지에서 읽은 글자","ko":"한글 이미지에서 읽은 글자"} (해당 이미지가 없으면 빈 문자열)';
function handRead(req) {
  if (!_hasOcrKey()) return { error: 'NO_KEY' };
  var pinWant = PropertiesService.getScriptProperties().getProperty(OCR_PIN_PROP) || '7084';
  if (String(req.pin || '') !== pinWant) return { error: 'BAD_PIN' };
  var imgs = (req.images || []).filter(function (x) { return x && x.b64; }).slice(0, 2);
  if (!imgs.length) return { error: 'NO_IMAGE' };
  var sp = PropertiesService.getScriptProperties();
  var dayKey = 'HD_N_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
  var n = Number(sp.getProperty(dayKey) || 0);
  if (n >= HAND_DAILY_MAX) return { error: 'DAILY_LIMIT' };
  sp.setProperty(dayKey, String(n + 1));
  var parts = [];
  imgs.forEach(function (x) {
    parts.push({ text: x.lang === 'ko' ? '[한글]' : '[영어]' });
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: String(x.b64) } });
  });
  parts.push({ text: HAND_PROMPT });
  var g = _geminiJSON(parts, 400);
  if (!g.ok) return { error: g.error };
  var d = g.data || {};
  if (d.items && d.items.length) d = d.items[0] || {};
  return { ok: true, en: String(d.en || '').trim(), ko: String(d.ko || '').trim(), model: g.model };
}

/* ===== 📷 선수 사진 목록 (레벨 → 그림 키) =====
 * 진도(PROGRESS)와 따로 둔다. 진도는 '마지막에 저장한 기기 것'이 통째로 덮어쓰기 때문에,
 * 사진 목록을 그 안에 두면 다른 기기가 저장할 때 사라질 수 있다.
 * → 여기서 따로 지키고, 진도를 내려줄 때 항상 이 목록을 넣어 준다. */
var PP_MAP_PROP = 'PLAYER_PHOTO_MAP';
function _ppMap() {
  var sp = PropertiesService.getScriptProperties(), raw = sp.getProperty(PP_MAP_PROP);
  if (raw) { try { return JSON.parse(raw) || {}; } catch (e) { return {}; } }
  var m = {};   // 처음 한 번: 지금 진도에 들어 있는 목록을 옮겨 온다
  try { var r = _store().getProperty(PROP_KEY), o = r ? JSON.parse(r) : null; if (o && o.pphoto) m = o.pphoto; } catch (e) {}
  sp.setProperty(PP_MAP_PROP, JSON.stringify(m));
  return m;
}
function ppSet(req) {
  if (!_pinOk(req)) return { error: 'BAD_PIN' };
  var lv = String(parseInt(req.lv, 10));
  if (!/^\d{1,2}$/.test(lv)) return { error: 'BAD_LV' };
  var key = String(req.key || '');
  if (key && !_origKeyOk(key)) return { error: 'BAD_KEY' };
  var lock = null;
  try { lock = LockService.getScriptLock(); lock.waitLock(5000); } catch (e) { lock = null; }
  var m = _ppMap();
  if (key) m[lv] = key; else delete m[lv];
  PropertiesService.getScriptProperties().setProperty(PP_MAP_PROP, JSON.stringify(m));
  try { if (lock) lock.releaseLock(); } catch (e) {}
  return { ok: true, map: m };
}

/* ===== 🗣️ Gemini 음성 (Cloud TTS 키가 없을 때) =====
 * 사진 읽기에 쓰는 Gemini 키로 사람 같은 목소리를 만든다.
 * 무료 한도가 모델마다 1분에 몇 번뿐이라, 한 번 만든 소리는 드라이브에 저장해 두고 다시 쓴다(같은 문장은 한 번만 만든다).
 * 한도에 걸리면 다음 모델로, 다 걸리면 BUSY → 앱이 기기 음성으로 읽는다. */
var GEM_TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'];
var GEM_TTS_VOICES = [['Kore', 'FEMALE'], ['Leda', 'FEMALE'], ['Aoede', 'FEMALE'], ['Zephyr', 'FEMALE'], ['Puck', 'MALE'], ['Charon', 'MALE'], ['Fenrir', 'MALE'], ['Orus', 'MALE']];
var GEM_TTS_DAILY_MAX = 2000;       // 하루에 새로 만드는 소리 상한
var GEM_TTS_MAX_CHARS = 600;        // 한 번에 읽는 글 길이 상한
var TTS_FOLDER_PROP = 'TTS_FOLDER_ID';
var TTS_FOLDER_NAME = '하준 영어 - 소리 저장';
function _ttsFolder(create) {
  var sp = PropertiesService.getScriptProperties(), id = sp.getProperty(TTS_FOLDER_PROP);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  if (!create) return null;
  var f = DriveApp.createFolder(TTS_FOLDER_NAME);
  sp.setProperty(TTS_FOLDER_PROP, f.getId());
  return f;
}
function _wav(pcm, rate) {   // 16비트 모노 PCM → WAV
  var n = pcm.length, h = [];
  function s(t) { for (var i = 0; i < t.length; i++) h.push(t.charCodeAt(i)); }
  function u32(v) { h.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255); }
  function u16(v) { h.push(v & 255, (v >> 8) & 255); }
  s('RIFF'); u32(36 + n); s('WAVE'); s('fmt '); u32(16); u16(1); u16(1); u32(rate); u32(rate * 2); u16(2); u16(16); s('data'); u32(n);
  var out = h.map(function (b) { return b > 127 ? b - 256 : b; });
  return out.concat(pcm);
}
function gemTts(req) {
  var text = String(req.text || '').trim();
  if (!text) {
    var s = String(req.ssml || '');
    if (/<phoneme/.test(s)) return { error: 'NO_PHONEME' };
    text = s.replace(/<break[^>]*>/g, ', ').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
  }
  if (!text) return { error: 'EMPTY' };
  if (text.length > GEM_TTS_MAX_CHARS) return { error: 'TOO_LONG' };
  var voice = 'Kore';
  GEM_TTS_VOICES.forEach(function (v) { if (v[0] === req.voice) voice = v[0]; });
  var dg = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, voice + '|' + text, Utilities.Charset.UTF_8);
  var name = 'tts_' + dg.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  var folder = null;
  try {
    folder = _ttsFolder(true);
    var it = folder.getFilesByName(name);
    if (it.hasNext()) return { audio: Utilities.base64Encode(it.next().getBlob().getBytes()), mime: 'audio/wav', marks: [], nat: true, rate: false, cached: true };
  } catch (e) { folder = null; }
  var sp = PropertiesService.getScriptProperties();
  var dayKey = 'GT_N_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
  var n = Number(sp.getProperty(dayKey) || 0);
  if (n >= GEM_TTS_DAILY_MAX) return { error: 'DAILY_LIMIT' };
  var payload = JSON.stringify({
    contents: [{ parts: [{ text: text }] }],   // 글만 보낸다 — 말투 지시문을 붙이면 그 지시문까지 읽어 버리는 모델이 있다
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } }
  });
  var lastErr = '';
  try {
    for (var t = 0; t < GEM_TTS_MODELS.length; t++) {
      var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + GEM_TTS_MODELS[t] + ':generateContent', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { 'x-goog-api-key': _ocrKey() }, payload: payload
      });
      var code = r.getResponseCode();
      if (code !== 200) { lastErr = 'HTTP ' + code + ' ' + GEM_TTS_MODELS[t]; continue; }   // 한도(429)·없어진 모델(404) → 다음 모델
      var j = JSON.parse(r.getContentText()), cand = (j.candidates || [])[0], inl = null;
      if (cand && cand.content && cand.content.parts) cand.content.parts.forEach(function (p) { if (p.inlineData && p.inlineData.data) inl = p.inlineData; });
      if (!inl) { lastErr = 'EMPTY ' + GEM_TTS_MODELS[t]; continue; }
      var bytes = Utilities.base64Decode(inl.data);
      var riff = bytes.length > 4 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70;
      if (!riff) { var m = /rate=(\d+)/.exec(String(inl.mimeType || '')); bytes = _wav(bytes, m ? Number(m[1]) : 24000); }
      sp.setProperty(dayKey, String(n + 1));
      try { if (folder) folder.createFile(Utilities.newBlob(bytes, 'audio/wav', name)); } catch (e) {}
      return { audio: Utilities.base64Encode(bytes), mime: 'audio/wav', marks: [], nat: true, rate: false, model: GEM_TTS_MODELS[t] };
    }
    return { error: 'BUSY ' + lastErr };
  } catch (e) { return { error: String(e) }; }
}

/* ===== 📌 오늘 할 것(숙제) =====
 * 아빠가 넣은 숙제 목록. 진도와 따로 둔다(다른 기기가 진도를 저장해도 지워지지 않게).
 * hw = { ts, items:[{id,t,due,how,note,done,doneAt}], notice:[글] }
 * 고치기(hwSet)는 아빠 비밀번호, 다 했다고 표시(hwCheck)는 하준이도 할 수 있다. */
var HW_PROP = 'HOMEWORK';
var HW_MAX_ITEMS = 40;
function _hw() {
  var raw = PropertiesService.getScriptProperties().getProperty(HW_PROP);
  if (raw) { try { var o = JSON.parse(raw); if (o && o.items) return o; } catch (e) {} }
  return { ts: 0, items: [], notice: [] };
}
function _hwSave(o) {
  o.ts = Date.now();
  var s = JSON.stringify(o);
  if (s.length > 8800) return false;   // 스크립트 속성 한 칸은 9KB까지
  PropertiesService.getScriptProperties().setProperty(HW_PROP, s);
  return true;
}
function hwSet(req) {
  if (!_pinOk(req)) return { error: 'BAD_PIN' };
  var d = req.hw || {}, items = [], S = function (v, n) { return String(v == null ? '' : v).slice(0, n); };
  (d.items || []).slice(0, HW_MAX_ITEMS).forEach(function (x) {
    if (!x || !String(x.t || '').trim()) return;
    items.push({ id: S(x.id, 24) || ('h' + Date.now().toString(36) + items.length), t: S(x.t, 120).trim(), due: S(x.due, 12).trim(), how: S(x.how, 60).trim(), note: S(x.note, 200).trim(), done: !!x.done, doneAt: x.done ? (Number(x.doneAt) || Date.now()) : 0 });
  });
  var o = { items: items, notice: (d.notice || []).slice(0, 8).map(function (t) { return S(t, 200).trim(); }).filter(function (t) { return t; }) };
  if (!_hwSave(o)) return { error: 'TOO_BIG' };
  return { ok: true, hw: o };
}
function hwCheck(req) {
  var lock = null;
  try { lock = LockService.getScriptLock(); lock.waitLock(5000); } catch (e) { lock = null; }
  var o = _hw(), hit = false, list = req.list || [{ id: req.id, done: req.done }];
  list.forEach(function (c) {
    o.items.forEach(function (x) { if (x.id === String(c.id)) { x.done = !!c.done; x.doneAt = x.done ? Date.now() : 0; hit = true; } });
  });
  if (hit) _hwSave(o);
  try { if (lock) lock.releaseLock(); } catch (e) {}
  return { ok: true, hw: o };
}

/* ===== ✍️ 글쓰기 기록 (영어일기 · 주제글쓰기) =====
 * AI가 고쳐 준 결과(글자만)를 드라이브의 파일 하나에 모아 둔다 → 어느 기기에서나 지난 글을 다시 볼 수 있다.
 * 진도와 따로 둔다(진도는 마지막에 저장한 기기 것이 덮어쓰므로). */
var WR_FILE = 'wr_log.json';
var WR_KEEP = 60;           // 이만큼만 남기고 오래된 것부터 지운다
function _wrRead() {
  try {
    var f = _origFolder(false); if (!f) return [];
    var it = f.getFilesByName(WR_FILE);
    if (!it.hasNext()) return [];
    var a = JSON.parse(it.next().getBlob().getDataAsString() || '[]');
    return a && a.length ? a : [];
  } catch (e) { return []; }
}
function _wrWrite(list) {
  var f = _origFolder(true), old = f.getFilesByName(WR_FILE);
  while (old.hasNext()) old.next().setTrashed(true);
  f.createFile(Utilities.newBlob(JSON.stringify(list), 'application/json', WR_FILE));
}
function wrAdd(req) {
  if (!_pinOk(req)) return { error: 'BAD_PIN' };
  var e = req.entry;
  if (!e || !e.id || !e.kind || !e.r) return { error: 'BAD_ENTRY' };
  if (JSON.stringify(e).length > 30000) return { error: 'TOO_BIG' };
  var lock = null;
  try { lock = LockService.getScriptLock(); lock.waitLock(8000); } catch (x) { lock = null; }
  try {
    var list = _wrRead().filter(function (x) { return x.id !== e.id; });
    list.push(e);
    if (list.length > WR_KEEP) list = list.slice(list.length - WR_KEEP);
    _wrWrite(list);
    return { ok: true, n: list.length };
  } catch (x) { return { error: 'DRIVE ' + String(x).slice(0, 200) }; }
  finally { try { if (lock) lock.releaseLock(); } catch (x) {} }
}
function wrDel(req) {
  if (!_pinOk(req)) return { error: 'BAD_PIN' };
  try {
    var list = _wrRead().filter(function (x) { return x.id !== String(req.id); });
    _wrWrite(list);
    return { ok: true, n: list.length };
  } catch (x) { return { error: 'DRIVE ' + String(x).slice(0, 200) }; }
}
/* ① 쓴 그대로 옮겨 적기 */
var WR_READ_PROMPT = {
  diary: '이미지는 초등학생이 손으로 쓴 영어 일기입니다. 보이는 글자를 한 글자도 고치지 말고 그대로 옮겨 적으세요. ' +
    '틀린 철자·대소문자·문장부호·문법도 틀린 그대로 둡니다(절대 바르게 고치지 않습니다). 줄바꿈은 원문의 줄대로. ' +
    'JSON으로만: {"text":"옮겨 적은 글"}. 영어 일기가 아니거나 읽을 수 없으면 {"error":"UNREADABLE"}.',
  topic: '이미지는 초등학생이 손으로 쓴 한글 글입니다. 보이는 글자를 한 글자도 고치지 말고 그대로 옮겨 적으세요. ' +
    '틀린 맞춤법·띄어쓰기·조사·문장부호도 틀린 그대로 둡니다(절대 바르게 고치지 않습니다. 예: "조아한다", "했는대", "할수있어서"는 그대로). 줄바꿈은 원문의 줄대로. ' +
    'JSON으로만: {"text":"옮겨 적은 글"}. 한글 글이 아니거나 읽을 수 없으면 {"error":"UNREADABLE"}.'
};
/* 영어일기 기준(아빠가 더하거나 뺄 수 있다) → 프롬프트 끝에 붙인다 */
function _wrRules(rules) {
  var a = (rules || []).slice(0, 12).map(function (t) { return String(t || '').slice(0, 80).trim(); }).filter(function (t) { return t; });
  if (!a.length) return '\n[기준]\n(없음 — checks 는 빈 배열, easy 는 fixed 를 더 쉬운 문장으로 다듬은 글)';
  return '\n[기준]\n' + a.map(function (t, i) { return (i + 1) + '. ' + t; }).join('\n');
}

/* ===== 🗑 지운 것 목록 (모든 기기 공용) =====
 * 진도는 '마지막에 저장한 기기 것'이 통째로 덮어쓴다. 그래서 한 기기에서 단어장을 지워도,
 * 옛 화면을 켜 둔 다른 기기가 저장하면 지운 것이 되살아났다.
 * → 지운 항목의 id 를 여기 따로 적어 두고, 진도를 내려줄 때·저장할 때마다 그 id 를 걸러 낸다. */
var DEAD_PROP = 'DEAD_IDS';
var DEAD_MAX = 300;
function _dead() {
  var raw = PropertiesService.getScriptProperties().getProperty(DEAD_PROP) || '';
  var o = {};
  raw.split(',').forEach(function (id) { if (id) o[id] = 1; });
  return o;
}
var GONE_DEF = { quizzes: 1, sents: 1, orig: 10, papers: 10 };   // 별 수가 안 적힌 옛 항목의 기본 별(앱의 STAR_QUIZ·STAR_SENT·STAR_ORIG·STAR_PAPER 와 같게)
/* 보관함은 '마지막에 저장한 기기'가 덮어써도 줄지 않게, 서버에 있던 것과 합친다(같은 id 는 큰 값) */
function _goneKeep(obj) {
  try {
    var pr = JSON.parse(_store().getProperty(PROP_KEY) || '{}');
    if (pr && pr.gone && typeof pr.gone === 'object') {
      if (!obj.gone || typeof obj.gone !== 'object') obj.gone = {};
      var back = 0;
      for (var gk in pr.gone) {
        var was = +obj.gone[gk] || 0, keep = Math.max(was, +pr.gone[gk] || 0);
        back += keep - was; obj.gone[gk] = keep;
      }
      /* 이 기기가 '별을 잃었다'고 보고 채워 둔 레벨 별(lvPad)이 있는데 그 별을 서버 보관함에서 되찾았으면, 되찾은 만큼 덜어 낸다(두 번 더해지지 않게) */
      if (back > 0 && +obj.lvPad > 0) obj.lvPad = Math.max(0, +obj.lvPad - back);
    }
    /* 가장 높았던 레벨 별(lvHi)도 줄지 않게 지킨다 → 어느 기기가 저장해도 레벨은 안 내려간다 */
    if (pr && typeof pr.lvBase === 'number' && pr.lvBase === obj.lvBase && +pr.lvHi > (+obj.lvHi || 0)) obj.lvHi = +pr.lvHi;
  } catch (e) {}
}
function _stripDead(o) {
  var d = _dead(), hit = false;
  if (!o || typeof o !== 'object') return false;
  for (var k in o) {
    if (Object.prototype.toString.call(o[k]) !== '[object Array]') continue;
    var f = o[k].filter(function (x) { return !(x && typeof x === 'object' && x.id && d[x.id]); });
    if (f.length !== o[k].length) {
      /* 지워지는 것이 받은 별은 보관함(gone)에 옮겨 적는다 → 지워도 별·레벨은 그대로 */
      o[k].forEach(function (x) {
        if (!(x && typeof x === 'object' && x.id && d[x.id] && x.done)) return;
        var def = GONE_DEF[k] || 0;
        var n = (k === 'papers') ? (typeof x.stars === 'number' ? x.stars : def) : (+x.stars || def);
        if (n > 0) { if (!o.gone || typeof o.gone !== 'object') o.gone = {}; o.gone[x.id] = Math.max(+o.gone[x.id] || 0, n); }
      });
      o[k] = f; hit = true;
    }
  }
  return hit;
}
function killIds(req) {
  if (!_pinOk(req)) return { error: 'BAD_PIN' };
  var add = (req.ids || []).map(function (x) { return String(x || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40); }).filter(function (x) { return x; });
  if (!add.length) return { error: 'NO_ID' };
  var lock = null;
  try { lock = LockService.getScriptLock(); lock.waitLock(8000); } catch (e) { lock = null; }
  try {
    var sp = PropertiesService.getScriptProperties();
    var list = (sp.getProperty(DEAD_PROP) || '').split(',').filter(function (x) { return x && add.indexOf(x) < 0; }).concat(add);
    if (list.length > DEAD_MAX) list = list.slice(list.length - DEAD_MAX);
    sp.setProperty(DEAD_PROP, list.join(','));
    /* 서버에 저장된 진도에서도 바로 지운다 */
    var raw = _store().getProperty(PROP_KEY);
    if (raw) { try { var o = JSON.parse(raw); if (_stripDead(o)) _store().setProperty(PROP_KEY, JSON.stringify(o)); } catch (e) {} }
    return { ok: true, n: list.length };
  } finally { try { if (lock) lock.releaseLock(); } catch (e) {} }
}

/* ===== 📗 북리포트 — 책 제목만 받아 Book Report 빈칸을 채운다 (사진 없음) =====
 * 종이의 빈칸은 늘 같다: WHO / WHEN / WHERE / WHAT / HOW & WHY / SUMMARY
 * 하루 호출 수는 사진 읽기(OCR_DAILY_MAX)와 같이 센다. */
var REPORT_PROMPT =
  '한국 초등학교 3학년 학생이 영어 그림책(원서)을 읽고 Book Report 학습지의 빈칸을 채우려고 합니다. 아래 [책 제목]의 책을 떠올려, 그 책의 실제 내용으로 빈칸에 쓸 말을 JSON으로만 답하세요.\n' +
  '형식: {"known":true,"title":"바른 책 제목","hero":"주인공 이름(한 낱말, 예: Maisy)","who":"","when":"","where":"","what":"","how":"","why":"",' +
  '"ko":{"who":"","when":"","where":"","what":"","how":"","why":""},"summary":["문장1","문장2","문장3","문장4","문장5"],"summaryKo":"summary 의 한국어 뜻(문장마다 줄바꿈)"}\n' +
  '학습지의 문장 틀(밑줄이 빈칸):\n' +
  ' WHO: "____ in the story."  → who 는 반드시 "등장인물 이름들 + is/are" 꼴(예: "Maisy and her friends are", "Buzz and Fly Guy are")\n' +
  ' WHEN: "The story happens ____"  → when (예: "in the morning.")\n' +
  ' WHERE: "The story happens at ____"  → where (예: "the library.")\n' +
  ' WHAT: "(hero) ____"  → what 은 주인공이 한 일(예: "looks for a book about fish.")\n' +
  ' HOW: "(hero) ____"  → how 는 주인공의 기분(예: "is happy")\n' +
  ' WHY: "because ____"  → why 는 그 기분의 까닭(예: "she finds a good book.")\n' +
  '규칙: ① 틀에 인쇄된 글(in the story / The story happens / The story happens at / 주인공 이름 / because)은 답에 되풀이하지 않는다. 틀 + 답을 이으면 문법이 맞는 한 문장이 되어야 한다. 문장 끝에는 마침표(how 는 뒤에 because 가 이어지므로 마침표 없이). ' +
  '② 초등 3학년이 아는 아주 쉬운 낱말로 짧게(답 하나에 10낱말 이내). 어려운 낱말·긴 문장·관계사절은 쓰지 않는다. ' +
  '③ summary 는 이야기 줄거리를 처음-가운데-끝 순서로 아주 쉬운 짧은 문장 5개(한 문장 8낱말 안팎). ' +
  '④ 반드시 그 책에 실제로 나오는 인물·장소·사건만 쓴다. 책에 때(아침·저녁 등)가 분명히 나오지 않으면 when 은 "one day." 로 쓴다. ' +
  '⑤ title 은 철자·대소문자를 바로잡은 책 제목. ko 의 각 값은 틀과 답을 이은 완성된 문장 전체의 쉬운 한국어 뜻(예: who → "메이지와 친구들이 이야기에 나와요."). summaryKo 도 쉬운 한국어. ' +
  '⑥ 그 책의 내용을 확실히 알지 못하면 지어내지 말고 {"known":false} 만 답한다.\n[책 제목] ';
function bookReport(req) {
  if (!_hasOcrKey()) return { error: 'NO_KEY' };
  var pinWant = PropertiesService.getScriptProperties().getProperty(OCR_PIN_PROP) || '7084';
  if (String(req.pin || '') !== pinWant) return { error: 'BAD_PIN' };
  var title = String(req.title || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
  if (title.length < 2) return { error: 'NO_TITLE' };
  var sp = PropertiesService.getScriptProperties();
  var dayKey = 'OCR_N_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
  var n = Number(sp.getProperty(dayKey) || 0);
  if (n >= OCR_DAILY_MAX) return { error: 'DAILY_LIMIT' };
  sp.setProperty(dayKey, String(n + 1));
  var g = _geminiJSON([{ text: REPORT_PROMPT + title }], 4000);
  if (!g.ok) return { error: g.error };
  var d = g.data || {};
  if (d.items && d.items.length && !d.who) d = d.items[0] || {};
  function S(v) { return String(v == null ? '' : v).trim(); }
  if (d.known === false || !S(d.who) || !S(d.what)) return { ok: true, data: { error: 'UNKNOWN_BOOK', title: title }, model: g.model };
  var hero = S(d.hero) || 'The main character', ko = d.ko || {};
  /* 모델이 틀의 글을 되풀이하거나 마침표를 빠뜨려도 바른 문장이 되게 다듬는다 */
  function cut(v, re) { return S(v).replace(re, '').trim(); }
  function dot(v) { v = S(v); return v && !/[.!?]$/.test(v) ? v + '.' : v; }
  var esc = hero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), heroRe = new RegExp('^' + esc + '\\s+', 'i');
  var who = cut(d.who, /\s*in the story\.?$/i).replace(/[.!?]+$/, '');
  if (/^(is|are)\b/i.test(who)) who = hero + ' is';
  else if (!/\b(is|are)$/i.test(who)) who += (/\band\b|,/i.test(who) ? ' are' : ' is');
  d.who = who;
  d.when = dot(cut(d.when, /^the story happens\s+/i));
  d.where = dot(cut(cut(d.where, /^the story happens\s+/i), /^at\s+/i));
  d.what = dot(cut(d.what, heroRe));
  d.how = cut(d.how, heroRe).replace(/[.!?]+$/, '');
  d.why = dot(cut(d.why, /^because\s+/i));
  var blanks = [
    { q: 'WHO (Who is in the story?)', pre: '', post: 'in the story.', answer: S(d.who), ko: S(ko.who) },
    { q: 'WHEN (When does the story happen?)', pre: 'The story happens', post: '', answer: S(d.when), ko: S(ko.when) },
    { q: 'WHERE (Where does the story happen?)', pre: 'The story happens at', post: '', answer: S(d.where), ko: S(ko.where) },
    { q: 'WHAT (What happens in the story?)', pre: hero, post: '', answer: S(d.what), ko: S(ko.what) },
    { q: 'HOW (How does ' + hero + ' feel?) & WHY', pre: hero, post: '', answer: S(d.how), ko: S(ko.how) },
    { q: 'HOW (How does ' + hero + ' feel?) & WHY', pre: 'because', post: '', answer: S(d.why), ko: S(ko.why) }
  ].filter(function (b) { return b.answer; });
  return { ok: true, model: g.model, data: { title: S(d.title) || title, src: 'memory', blanks: blanks,
    summary: (d.summary || []).map(S).filter(function (x) { return x; }).slice(0, 6), summaryKo: S(d.summaryKo) } };
}

/* ===== ✏️ 손글씨 여러 장 읽기 (원서 단어·숙어 시험 채점) =====
 * images: [{lang:'en'|'ko', b64}] → items: 이미지마다 읽은 글자(순서 그대로). 하루 횟수는 손글씨 읽기(HAND_DAILY_MAX)와 같이 센다. */
var HAND_LIST_MAX = 12;
var HAND_LIST_PROMPT =
  '위 이미지들은 초등학생이 펜으로 화면에 쓴 손글씨다. 이미지마다 앞에 [번호|영어] 또는 [번호|한글] 표시가 있다.\n' +
  '각 이미지에 쓰인 글을 읽어 JSON 하나로만 답한다: {"items":["1번에서 읽은 글","2번에서 읽은 글"]}\n' +
  '규칙:\n' +
  '1) items 의 칸 수는 이미지 수와 같고 순서도 같다.\n' +
  '2) 보이는 글자를 그대로 읽는다. 철자가 틀렸거나 말이 이상해도 절대 고치거나 추측해서 바꾸지 않는다(받아쓰기 채점용이다).\n' +
  '3) [영어]는 알파벳(소문자로)·띄어쓰기·아포스트로피만, [한글]은 한글·띄어쓰기만 적는다.\n' +
  '4) 글자가 없거나 전혀 못 읽겠으면 그 칸은 빈 문자열.';
function handList(req) {
  if (!_hasOcrKey()) return { error: 'NO_KEY' };
  var pinWant = PropertiesService.getScriptProperties().getProperty(OCR_PIN_PROP) || '7084';
  if (String(req.pin || '') !== pinWant) return { error: 'BAD_PIN' };
  var imgs = (req.images || []).filter(function (x) { return x && x.b64; }).slice(0, HAND_LIST_MAX);
  if (!imgs.length) return { error: 'NO_IMAGE' };
  var sp = PropertiesService.getScriptProperties();
  var dayKey = 'HD_N_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
  var n = Number(sp.getProperty(dayKey) || 0);
  if (n >= HAND_DAILY_MAX) return { error: 'DAILY_LIMIT' };
  sp.setProperty(dayKey, String(n + 1));
  var parts = [];
  imgs.forEach(function (x, i) {
    parts.push({ text: '[' + (i + 1) + '|' + (x.lang === 'ko' ? '한글' : '영어') + ']' });
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: String(x.b64) } });
  });
  parts.push({ text: HAND_LIST_PROMPT });
  var g = _geminiJSON(parts, 1500);
  if (!g.ok) return { error: g.error };
  var d = g.data || {}, arr = Array.isArray(d) ? d : (d.items || []);
  var out = arr.map(function (x) { return String(x && typeof x === 'object' ? (x.text || x.en || x.ko || '') : (x == null ? '' : x)).trim(); }).slice(0, imgs.length);
  while (out.length < imgs.length) out.push('');
  return { ok: true, items: out, model: g.model };
}

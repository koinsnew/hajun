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
  else if (action === 'ppSet')  out = ppSet(body);
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
    return o;
  } catch (e) {
    return { stars: {}, name: '', rate: 0.8 };
  }
}
function saveProgress(obj) {
  if (!obj || typeof obj !== 'object') return false;
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
  quiz:
    '이미지는 영어 단어 학습지/단어장 사진입니다. 각 문제 항목을 읽어 JSON으로만 답하세요.\n' +
    '형식: {"title":"단어장 이름 추정(없으면 빈 문자열)","items":[{"def":"English definition(영어 뜻풀이 문장)","w":"정답 영어 단어","k":"한글 뜻"}]}\n' +
    '규칙: def는 이미지에 있는 영어 뜻풀이를 그대로, w는 그 뜻풀이의 정답 단어(소문자), k는 이미지에 한글 뜻이 있으면 그대로, ' +
    '없으면 초등학생용 짧은 한글 뜻을 직접 쓰세요. 이미지에 없는 항목을 지어내지 말고 읽을 수 없으면 빼세요. 여러 이미지는 순서대로 이어서 하나의 items에 담으세요.',
  sent:
    '이미지는 영어 문장이 담긴 교재/학습지 사진입니다. 영어 문장을 읽고 JSON으로만 답하세요.\n' +
    '형식: {"title":"이름 추정(없으면 빈 문자열)","items":[{"en":"English sentence","ko":"자연스러운 한글 해석"}]}\n' +
    '규칙: 문장은 이미지 그대로(오탈자 고치지 말 것), 문장 하나가 한 항목. 한글 해석이 이미지에 있으면 그것을 쓰고 없으면 초등학생 눈높이로 번역. ' +
    '이미지에 없는 문장을 지어내지 마세요. 여러 이미지는 순서대로 이어서 담으세요.',
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
  parts.push({ text: OCR_PROMPTS[kind] });

  var g = _geminiJSON(parts, 8000);
  if (!g.ok) return { error: g.error };
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

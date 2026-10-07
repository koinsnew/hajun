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
    return o;
  } catch (e) {
    return { stars: {}, name: '', rate: 0.8 };
  }
}
function saveProgress(obj) {
  if (!obj || typeof obj !== 'object') return false;
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
  var k = _ttsKey();
  return { enabled: !!(k && k !== 'YOUR_KEY') };
}

function ttsVoices() {
  var k = _ttsKey();
  if (!k || k === 'YOUR_KEY') return { error: 'NO_KEY' };
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
  if (!k || k === 'YOUR_KEY') return { error: 'NO_KEY' };
  var ssml  = String(req.ssml || '');
  var voice = req.voice || 'en-US-Neural2-F';
  var rate  = Number(req.rate) || 1.0;
  var marks = !!req.marks;
  if (!ssml) return { error: 'EMPTY' };

  var ck = 'tts_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, ssml + '|' + voice + '|' + rate + '|' + marks));
  var cache = CacheService.getScriptCache();
  var hit = cache.get(ck);
  if (hit) return JSON.parse(hit);

  var body = {
    input: { ssml: ssml },
    voice: { languageCode: 'en-US', name: voice },
    audioConfig: { audioEncoding: 'MP3', speakingRate: rate, pitch: 0, volumeGainDb: 0 }
  };
  if (marks) body.enableTimePointing = ['SSML_MARK'];

  try {
    var r = UrlFetchApp.fetch('https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=' + encodeURIComponent(k), {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(body), muteHttpExceptions: true
    });
    var code = r.getResponseCode(), txt = r.getContentText();
    if (code !== 200) return { error: 'HTTP ' + code + ' ' + txt.slice(0, 300) };
    var j = JSON.parse(txt);
    var out = { audio: j.audioContent, marks: j.timepoints || [] };
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
    '글이 없는 쪽(그림만)은 빈 문자열. 표지 이미지는 pages에 넣지 말고 title/by에만 반영. 읽을 수 없는 글자는 추측하지 말고 가능한 만큼만.'
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

  try {
    var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + OCR_MODEL + ':generateContent', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-goog-api-key': _ocrKey() },
      payload: JSON.stringify({
        contents: [{ role: 'user', parts: parts }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 8000 }
      })
    });
    var code = r.getResponseCode(), txt = r.getContentText();
    if (code !== 200) return { error: 'HTTP ' + code + ' ' + txt.slice(0, 300) };
    var j = JSON.parse(txt);
    var cand = (j.candidates || [])[0];
    var text = cand && cand.content && cand.content.parts
      ? cand.content.parts.map(function (p) { return p.text || ''; }).join('') : '';
    if (!text) return { error: 'EMPTY ' + (j.promptFeedback ? JSON.stringify(j.promptFeedback).slice(0, 150) : (cand && cand.finishReason) || '') };
    var m = text.match(/\{[\s\S]*\}/);
    if (!m) return { error: 'PARSE', raw: text.slice(0, 200) };
    var data = JSON.parse(m[0]);
    return { ok: true, data: data };
  } catch (e) { return { error: String(e) }; }
}

const crypto = require('node:crypto');

const SUPABASE_URL = 'https://jxrmihxzmqugrkdpmchx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cKdNxQjcnTTTdyZEHQutJQ_DUtCHkYb';
const DEFAULT_ORIGIN = 'https://ruangbelajar-ten.vercel.app';
const HEADERS = ['Waktu', 'Nama Lengkap', 'Kelas', 'Mata Pelajaran', 'Topik', 'Tujuan Pembelajaran', 'Nilai', 'KKM', 'Status', 'Jumlah Soal'];

function send(res, status, body) { res.status(status).json(body); }

function parseGooglePrivateKey(value) {
  let raw = String(value || '').trim();
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try { raw = JSON.parse(raw); } catch { /* Continue with the original value. */ }
  }
  if (raw.startsWith('{')) {
    try { raw = JSON.parse(raw).private_key || raw; } catch { /* Not a service-account JSON document. */ }
  }
  raw = raw.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  try { return crypto.createPrivateKey(raw); }
  catch { throw new Error('Google private key is not a valid PEM. Set GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY to the service account private_key value.'); }
}
function base64url(value) { return Buffer.from(value).toString('base64url'); }

function serviceAssertion(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + base64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url');
  return unsigned + '.' + signature;
}

async function getGoogleAccessToken(email, privateKey) {
  const assertion = serviceAssertion(email, privateKey);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) throw new Error('Google authentication failed');
  return body.access_token;
}

function sheetTitleForSubject(subject) {
  const title = subject.replace(/[\/?*:[\]]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').slice(0, 100);
  return title || 'Mata Pelajaran';
}

async function ensureSubjectSheet(token, spreadsheetId, title) {
  const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId);
  const metadataResponse = await fetch(base + '?fields=sheets.properties(sheetId,title)', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!metadataResponse.ok) {
    console.error('Google Sheets metadata lookup failed:', metadataResponse.status, await metadataResponse.text());
    throw new Error('Google Sheets metadata lookup failed');
  }
  const metadata = await metadataResponse.json();
  if ((metadata.sheets || []).some(sheet => sheet.properties && sheet.properties.title === title)) return;
  const createResponse = await fetch(base + ':batchUpdate', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] })
  });
  if (createResponse.ok) return;
  const verifyResponse = await fetch(base + '?fields=sheets.properties(sheetId,title)', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const verify = verifyResponse.ok ? await verifyResponse.json() : {};
  if (!(verify.sheets || []).some(sheet => sheet.properties && sheet.properties.title === title)) {
    console.error('Google Sheets tab creation failed:', await createResponse.text());
    throw new Error('Google Sheets tab creation failed');
  }
}

async function ensureSubjectHeaders(token, spreadsheetId, title) {
  const quotedTitle = "'" + title.replace(/'/g, "''") + "'";
  const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values/' + encodeURIComponent(quotedTitle + '!A1:J1');
  const currentResponse = await fetch(base, { headers: { Authorization: 'Bearer ' + token } });
  if (!currentResponse.ok) throw new Error('Google Sheets header lookup failed');
  const current = await currentResponse.json();
  if (current.values && current.values[0] && current.values[0].some(value => String(value).trim())) return;
  const headerResponse = await fetch(base + '?valueInputOption=RAW', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ majorDimension: 'ROWS', values: [HEADERS] })
  });
  if (!headerResponse.ok) throw new Error('Google Sheets header setup failed');
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin;
  const allowedOrigin = process.env.APP_ORIGIN || DEFAULT_ORIGIN;
  if (origin && origin !== allowedOrigin) return send(res, 403, { error: 'Origin tidak diizinkan.' });
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Metode tidak didukung.' });

  try {
    const authorization = req.headers.authorization || '';
    const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!accessToken) return send(res, 401, { error: 'Sesi siswa tidak ditemukan.' });
    const authResponse = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + accessToken }
    });
    const user = await authResponse.json().catch(() => ({}));
    if (!authResponse.ok || user.is_anonymous !== true) return send(res, 401, { error: 'Sesi siswa tidak valid.' });

    const body = req.body || {};
    const fullName = String(body.fullName || '').trim().replace(/\s+/g, ' ');
    const grade = String(body.grade || '').trim();
    const subject = String(body.subject || '').trim();
    const topic = String(body.topic || '').trim();
    const objective = String(body.objective || '').trim();
    const score = Number(body.score);
    const kkm = Number(body.kkm);
    const totalQuestions = Number(body.totalQuestions);
    const passed = body.passed === true;
    const submittedAt = new Date(body.submittedAt || Date.now());
    if (fullName.length < 3 || fullName.length > 100 || /[\u0000-\u001f]/.test(fullName)) return send(res, 400, { error: 'Nama lengkap tidak valid.' });
    if (!/^(?:[7-9][A-E]|Kelas [789])$/.test(grade)) return send(res, 400, { error: 'Kelas tidak valid.' });
    if (!subject || subject.length > 100 || !topic || topic.length > 200 || objective.length > 1000) return send(res, 400, { error: 'Informasi ujian tidak valid.' });
    if (!Number.isInteger(score) || score < 0 || score > 100 || !Number.isInteger(kkm) || kkm < 0 || kkm > 100 || !Number.isInteger(totalQuestions) || totalQuestions < 1 || totalQuestions > 100) return send(res, 400, { error: 'Nilai ujian tidak valid.' });
    if (Number.isNaN(submittedAt.getTime())) return send(res, 400, { error: 'Waktu ujian tidak valid.' });

    const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKeyValue = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!serviceEmail || !privateKeyValue || !spreadsheetId) return send(res, 503, { error: 'Integrasi Google Sheets belum selesai disiapkan.' });

    const privateKey = parseGooglePrivateKey(privateKeyValue);
    const token = await getGoogleAccessToken(serviceEmail, privateKey);
    const sheetName = sheetTitleForSubject(subject);
    await ensureSubjectSheet(token, spreadsheetId, sheetName);
    await ensureSubjectHeaders(token, spreadsheetId, sheetName);
    const quotedRange = "'" + sheetName.replace(/'/g, "''") + "'!A:J";
    const appendUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values/' + encodeURIComponent(quotedRange) + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
    const appendResponse = await fetch(appendUrl, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ majorDimension: 'ROWS', values: [[
        submittedAt.toISOString(), fullName, grade, subject, topic, objective,
        score, kkm, passed ? 'Lulus' : 'Belum mencapai KKM', totalQuestions
      ]] })
    });
    if (!appendResponse.ok) {
      console.error('Google Sheets append failed:', await appendResponse.text());
      return send(res, 502, { error: 'Google Sheets menolak penyimpanan. Periksa akses spreadsheet dan konfigurasi.' });
    }
    return send(res, 200, { ok: true, sheetName });
  } catch (error) {
    console.error('Test result submission failed:', error);
    return send(res, 500, { error: 'Terjadi kendala saat mengirim hasil ujian.' });
  }
};

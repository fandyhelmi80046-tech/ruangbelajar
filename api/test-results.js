const crypto = require('node:crypto');

const SUPABASE_URL = 'https://jxrmihxzmqugrkdpmchx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cKdNxQjcnTTTdyZEHQutJQ_DUtCHkYb';
const DEFAULT_ORIGIN = 'https://ruangbelajar-ten.vercel.app';
const SUBJECTS = ['Matematika', 'Bahasa Indonesia', 'IPA', 'IPS', 'Bahasa Inggris', 'PPKn', 'Seni Budaya', 'PJOK', 'Informatika', 'Prakarya', 'Agama'];
function send(res, status, body) { res.status(status).json(body); }
function parseGooglePrivateKey(value) {
  let raw = String(value || '').trim();
  if (raw.startsWith('"') && raw.endsWith('"')) { try { raw = JSON.parse(raw); } catch {} }
  if (raw.startsWith('{')) { try { raw = JSON.parse(raw).private_key || raw; } catch {} }
  raw = raw.split(String.fromCharCode(92) + 'n').join(String.fromCharCode(10)).trim();
  try { return crypto.createPrivateKey(raw); }
  catch { throw new Error('Google private key is not a valid PEM.'); }
}
function base64url(value) { return Buffer.from(value).toString('base64url'); }
function serviceAssertion(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + base64url(JSON.stringify({ iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  return unsigned + '.' + crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url');
}
async function getGoogleAccessToken(email, privateKey) {
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: serviceAssertion(email, privateKey) }) });
  const body = await response.json();
  if (!response.ok || !body.access_token) throw new Error('Google authentication failed');
  return body.access_token;
}
function sheetTitleForSubject(subject) { return subject.slice(0, 100); }
async function isTeacher(token) {
  const authResponse = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token } });
  const user = await authResponse.json().catch(() => ({}));
  if (!authResponse.ok || !user.id || user.is_anonymous === true) return false;
  const url = SUPABASE_URL + '/rest/v1/teachers?user_id=eq.' + encodeURIComponent(user.id) + '&select=user_id';
  const roleResponse = await fetch(url, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token } });
  const rows = await roleResponse.json().catch(() => []);
  return roleResponse.ok && Array.isArray(rows) && rows.some(row => row.user_id === user.id);
}
module.exports = async function handler(req, res) {
  const origin = req.headers.origin;
  const allowedOrigin = process.env.APP_ORIGIN || DEFAULT_ORIGIN;
  if (origin && origin !== allowedOrigin) return send(res, 403, { error: 'Origin tidak diizinkan.' });
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'DELETE') return send(res, 405, { error: 'Metode tidak didukung.' });
  try {
    const auth = req.headers.authorization || '';
    const userToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!userToken || !(await isTeacher(userToken))) return send(res, 401, { error: 'Silakan masuk sebagai guru untuk melihat laporan.' });
    if (req.method === 'DELETE') {      const body = req.body || {};      const deleteSubject = String(body.subject || '').trim();      const deleteTopic = String(body.topic || '').trim();      const deleteObjective = String(body.objective || '').trim();      if (!SUBJECTS.includes(deleteSubject)) return send(res, 400, { error: 'Mata pelajaran tidak valid.' });      if (!deleteTopic || deleteTopic.length > 200 || !deleteObjective || deleteObjective.length > 1000) return send(res, 400, { error: 'Topik dan tujuan pembelajaran wajib diisi.' });      const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;      const keyValue = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';      const spreadsheetId = process.env.GOOGLE_SHEET_ID;      if (!email || !keyValue || !spreadsheetId) return send(res, 503, { error: 'Integrasi Google Sheets belum dikonfigurasi.' });      const googleToken = await getGoogleAccessToken(email, parseGooglePrivateKey(keyValue));      const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId);      const metaResponse = await fetch(base + '?fields=sheets.properties(sheetId,title)', { headers: { Authorization: 'Bearer ' + googleToken } });      if (!metaResponse.ok) throw new Error('Google Sheets metadata lookup failed: ' + metaResponse.status);      const meta = await metaResponse.json();      const sheet = (meta.sheets || []).map(item => item.properties).find(item => item && item.title === sheetTitleForSubject(deleteSubject));      if (!sheet) return send(res, 200, { ok: true, deleted: 0 });      const range = "'" + sheet.title.replace(/'/g, "''") + "'!A2:J";      const valuesResponse = await fetch(base + '/values/' + encodeURIComponent(range), { headers: { Authorization: 'Bearer ' + googleToken } });      if (!valuesResponse.ok) throw new Error('Google Sheets data lookup failed: ' + valuesResponse.status);      const values = await valuesResponse.json();      const matchingIndices = (values.values || []).map((row, index) => String(row[4] || '').trim() === deleteTopic && String(row[5] || '').trim() === deleteObjective ? index : -1).filter(index => index >= 0);      if (!matchingIndices.length) return send(res, 200, { ok: true, deleted: 0 });      const requests = matchingIndices.reverse().map(index => ({ deleteDimension: { range: { sheetId: sheet.sheetId, dimension: 'ROWS', startIndex: index + 1, endIndex: index + 2 } } }));      const deleteResponse = await fetch(base + ':batchUpdate', { method: 'POST', headers: { Authorization: 'Bearer ' + googleToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) });      if (!deleteResponse.ok) throw new Error('Google Sheets deletion failed: ' + deleteResponse.status);      return send(res, 200, { ok: true, deleted: matchingIndices.length });    }    const subject = String(req.query.subject || 'Semua').trim();
    const grade = String(req.query.grade || 'Semua').trim();
    const topic = String(req.query.topic || 'Semua').trim();
    if (subject !== 'Semua' && !SUBJECTS.includes(subject)) return send(res, 400, { error: 'Filter mata pelajaran tidak valid.' });
    if (grade !== 'Semua' && !/^(?:[7-9][A-E]|Kelas [789])$/.test(grade)) return send(res, 400, { error: 'Filter kelas tidak valid.' });
    if (topic.length > 200) return send(res, 400, { error: 'Filter topik terlalu panjang.' });
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const keyValue = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!email || !keyValue || !spreadsheetId) return send(res, 503, { error: 'Integrasi Google Sheets belum dikonfigurasi.' });
    const googleToken = await getGoogleAccessToken(email, parseGooglePrivateKey(keyValue));
    const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId);
    const metaResponse = await fetch(base + '?fields=sheets.properties(title)', { headers: { Authorization: 'Bearer ' + googleToken } });
    if (!metaResponse.ok) throw new Error('Google Sheets metadata lookup failed: ' + metaResponse.status);
    const meta = await metaResponse.json();
    let titles = (meta.sheets || []).map(s => s.properties && s.properties.title).filter(Boolean).filter(t => t !== 'Hasil Tes');
    if (subject !== 'Semua') titles = titles.filter(t => t === sheetTitleForSubject(subject));
    const rows = [];
    for (const title of titles) {
      const range = "'" + title.replace(/'/g, "''") + "'!A2:J";
      const response = await fetch(base + '/values/' + encodeURIComponent(range), { headers: { Authorization: 'Bearer ' + googleToken } });
      if (!response.ok) { if (response.status === 404) continue; throw new Error('Google Sheets data lookup failed: ' + response.status); }
      const data = await response.json();
      for (const r of data.values || []) {
        if (r.length < 2 || (grade !== 'Semua' && String(r[2] || '').trim() !== grade) || (topic !== 'Semua' && String(r[4] || '').trim() !== topic)) continue;
        rows.push({ waktu: r[0] || '', nama: r[1] || '', kelas: r[2] || '', mataPelajaran: r[3] || title, topik: r[4] || '', tujuan: r[5] || '', nilai: r[6] || '', kkm: r[7] || '', status: r[8] || '', jumlahSoal: r[9] || '' });
      }
    }
    rows.sort((a, b) => String(b.waktu).localeCompare(String(a.waktu)));
    return send(res, 200, { ok: true, rows: rows.slice(0, 5000) });
  } catch (error) {
    console.error('Test report lookup failed:', error);
    return send(res, 500, { error: 'Data hasil ujian gagal diambil dari Google Sheets.' });
  }
};

const crypto = require('node:crypto');

const SUPABASE_URL = 'https://jxrmihxzmqugrkdpmchx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cKdNxQjcnTTTdyZEHQutJQ_DUtCHkYb';
const DEFAULT_ORIGIN = 'https://ruangbelajar-ten.vercel.app';

function send(res, status, body) { res.status(status).json(body); }
function base64url(value) { return Buffer.from(value).toString('base64url'); }

function serviceAssertion(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify({
    iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  }))}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url');
  return `${unsigned}.${signature}`;
}

async function getGoogleAccessToken(email, privateKey) {
  const assertion = serviceAssertion(email, privateKey);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) throw new Error('Google authentication failed');
  return body.access_token;
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
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` }
    });
    const user = await authResponse.json().catch(() => ({}));
    if (!authResponse.ok || user.is_anonymous !== true) return send(res, 401, { error: 'Sesi siswa tidak valid.' });

    const body = req.body || {};
    const fullName = String(body.fullName || '').trim().replace(/\s+/g, ' ');
    const grade = String(body.grade || '').trim();
    const subject = String(body.subject || '').trim();
    const topic = String(body.topic || '').trim();
    const objective = String(body.objective || '').trim();
    const score = Number(body.score), kkm = Number(body.kkm), totalQuestions = Number(body.totalQuestions);
    const passed = body.passed === true;
    const submittedAt = new Date(body.submittedAt || Date.now());
    if (fullName.length < 3 || fullName.length > 100 || /[\u0000-\u001f]/.test(fullName)) return send(res, 400, { error: 'Nama lengkap tidak valid.' });
    if (!['Kelas 7', 'Kelas 8', 'Kelas 9'].includes(grade)) return send(res, 400, { error: 'Kelas tidak valid.' });
    if (!subject || subject.length > 100 || !topic || topic.length > 200 || objective.length > 1000) return send(res, 400, { error: 'Informasi ujian tidak valid.' });
    if (!Number.isInteger(score) || score < 0 || score > 100 || !Number.isInteger(kkm) || kkm < 0 || kkm > 100 || !Number.isInteger(totalQuestions) || totalQuestions < 1 || totalQuestions > 100) return send(res, 400, { error: 'Nilai ujian tidak valid.' });
    if (Number.isNaN(submittedAt.getTime())) return send(res, 400, { error: 'Waktu ujian tidak valid.' });

    const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = process.env.GOOGLE_SHEET_TAB || 'Hasil Tes';
    if (!serviceEmail || !privateKey || !spreadsheetId) return send(res, 503, { error: 'Integrasi Google Sheets belum selesai disiapkan.' });

    const token = await getGoogleAccessToken(serviceEmail, privateKey);
    const range = encodeURIComponent(`'${sheetName.replace(/'/g, "''")}'!A:J`);
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    const appendResponse = await fetch(appendUrl, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ majorDimension: 'ROWS', values: [[
        submittedAt.toISOString(), fullName, grade, subject, topic, objective, score, kkm,
        passed ? 'Lulus' : 'Belum mencapai KKM', totalQuestions
      ]] })
    });
    if (!appendResponse.ok) {
      console.error('Google Sheets append failed:', await appendResponse.text());
      return send(res, 502, { error: 'Google Sheets menolak penyimpanan. Periksa akses spreadsheet dan konfigurasi.' });
    }
    return send(res, 200, { ok: true });
  } catch (error) {
    console.error('Test result submission failed:', error);
    return send(res, 500, { error: 'Terjadi kendala saat mengirim hasil ujian.' });
  }
};

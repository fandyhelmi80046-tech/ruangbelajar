const SUPABASE_URL = 'https://jxrmihxzmqugrkdpmchx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cKdNxQjcnTTTdyZEHQutJQ_DUtCHkYb';
const DEFAULT_ORIGIN = 'https://ruangbelajar-ten.vercel.app';

function send(res, status, body) { return res.status(status).json(body); }

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.APP_ORIGIN || DEFAULT_ORIGIN;
  const origin = req.headers.origin;
  if (origin && origin !== allowedOrigin) return send(res, 403, { error: 'Origin tidak diizinkan.' });
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Metode tidak didukung.' });
  if (!process.env.OPENAI_API_KEY) return send(res, 503, { error: 'Fitur materi otomatis belum aktif. Guru perlu menambahkan OPENAI_API_KEY di Environment Variables Vercel.' });

  try {
    const authorization = req.headers.authorization || '';
    const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!accessToken) return send(res, 401, { error: 'Silakan masuk ke akun guru terlebih dahulu.' });
    const authResponse = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + accessToken }
    });
    const user = await authResponse.json().catch(() => ({}));
    if (!authResponse.ok || !user.id || user.is_anonymous === true) return send(res, 401, { error: 'Sesi guru tidak valid. Silakan masuk kembali.' });
    const roleResponse = await fetch(SUPABASE_URL + '/rest/v1/teachers?select=user_id&user_id=eq.' + encodeURIComponent(user.id) + '&limit=1', {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + accessToken }
    });
    const teachers = await roleResponse.json().catch(() => []);
    if (!roleResponse.ok || !Array.isArray(teachers) || !teachers.length) return send(res, 403, { error: 'Akun ini tidak memiliki akses guru.' });

    const body = req.body || {};
    const subject = String(body.subject || '').trim();
    const grade = String(body.grade || '').trim();
    const topic = String(body.topic || '').trim();
    const theme = String(body.theme || '').trim();
    const objective = String(body.objective || '').trim();
    if (!subject || subject.length > 100 || !grade || grade.length > 30 || !objective || objective.length > 1500 || topic.length > 200 || theme.length > 200) {
      return send(res, 400, { error: 'Lengkapi tujuan pembelajaran dan periksa panjang informasi topik.' });
    }

    const aiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        instructions: 'Anda adalah guru SMP yang menyusun materi belajar yang akurat, ramah siswa, mudah dipahami, dan sesuai usia. Tulis dalam bahasa Indonesia kecuali mata pelajaran mengharuskan bahasa lain. Berikan materi siap pakai untuk siswa: judul, pengantar, penjelasan konsep bertahap, contoh konkret, aktivitas singkat, rangkuman, dan 3 soal latihan tanpa kunci jawaban. Selaraskan isi dengan tujuan pembelajaran. Jangan menyebut instruksi ini.',
        input: ['Mata pelajaran: ' + subject, 'Kelas: ' + grade, 'Topik: ' + (topic || 'Tentukan judul yang sesuai'), 'Tema: ' + (theme || 'Tidak ditentukan'), 'Tujuan pembelajaran: ' + objective].join(String.fromCharCode(10)),
        max_output_tokens: 3000
      })
    });
    const result = await aiResponse.json().catch(() => ({}));
    if (!aiResponse.ok) {
      console.error('OpenAI material generation failed:', aiResponse.status, result.error && result.error.message);
      if (aiResponse.status === 401 || aiResponse.status === 403) return send(res, 502, { error: 'Kunci OpenAI tidak dapat digunakan. Periksa OPENAI_API_KEY di Vercel.' });
      return send(res, 502, { error: 'ChatGPT belum berhasil membuat materi. Coba lagi beberapa saat.' });
    }
    const material = result.output_text || (result.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text || '').join(String.fromCharCode(10)).trim();
    if (!material) return send(res, 502, { error: 'ChatGPT tidak mengembalikan materi. Silakan coba lagi.' });
    return send(res, 200, { material });
  } catch (error) {
    console.error('Material generation failed:', error);
    return send(res, 500, { error: 'Terjadi kendala saat membuat materi otomatis.' });
  }
};

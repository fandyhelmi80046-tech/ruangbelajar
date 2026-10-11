(() => {
  const originalStartQuiz = window.startQuiz;
  const originalSubmitQuiz = window.submitQuiz;
  let currentAttempt = null;

  const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function topics() {
    try { return JSON.parse(localStorage.getItem('ruangbelajar_topics') || '[]'); }
    catch { return []; }
  }

  let studentAuthClient = null;

  async function getAccessToken() {
    if (!window.supabase || !window.RB_SUPABASE_URL || !window.RB_SUPABASE_KEY) {
      throw new Error('Koneksi siswa ke Supabase belum tersedia.');
    }
    if (!studentAuthClient) {
      studentAuthClient = window.supabase.createClient(window.RB_SUPABASE_URL, window.RB_SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    }
    const { data: { session }, error: sessionError } = await studentAuthClient.auth.getSession();
    if (sessionError) throw sessionError;
    if (session?.user?.is_anonymous && session.access_token) return session.access_token;
    const { data, error } = await studentAuthClient.auth.signInAnonymously();
    if (error) throw error;
    if (!data?.user?.is_anonymous || !data?.session?.access_token) {
      throw new Error('Sesi siswa anonim gagal dibuat. Pastikan Anonymous Sign-ins aktif di Supabase.');
    }
    return data.session.access_token;
  }

  function readStoredToken() {
    const ref = new URL(window.RB_SUPABASE_URL).hostname.split('.')[0];
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    if (!raw) return null;
    const decoded = raw.startsWith('base64-') ? atob(raw.slice(7)) : raw;
    const session = JSON.parse(decoded);
    return session.access_token || session.currentSession?.access_token || null;
  }

  window.startQuiz = function (lessonId) {
    const lesson = topics().find(item => item.id === lessonId);
    if (!lesson) return originalStartQuiz(lessonId);

    const body = document.getElementById('detailBody');
    body.innerHTML = `
      <div class="gradebox">Sebelum ujian dimulai, isi nama lengkap dan kelas. Data ini dicatat bersama hasil ujian.</div>
      <form id="studentIdentityForm" class="formgrid" style="margin-top:14px">
        <div class="field wide"><label for="studentFullName">Nama lengkap</label><input id="studentFullName" name="fullName" autocomplete="name" maxlength="100" required placeholder="Contoh: Siti Aminah"></div>
        <div class="field wide"><label for="studentGrade">Kelas</label><select id="studentGrade" name="grade" required><option value="">Pilih kelas</option><option>7A</option><option>7B</option><option>7C</option><option>7D</option><option>7E</option><option>8A</option><option>8B</option><option>8C</option><option>8D</option><option>8E</option><option>9A</option><option>9B</option><option>9C</option><option>9D</option><option>9E</option></select></div>
        <div class="field wide"><div class="manage-note">${esc(lesson.subject)} · ${esc(lesson.topic)}</div></div>
        <div class="field wide"><button class="primary" type="submit">Lanjut ke ujian →</button></div>
      </form>`;

    document.getElementById('studentIdentityForm').addEventListener('submit', event => {
      event.preventDefault();
      const fullName = document.getElementById('studentFullName').value.trim().replace(/\s+/g, ' ');
      const grade = document.getElementById('studentGrade').value;
      if (fullName.length < 3 || /[\u0000-\u001f]/.test(fullName) || !grade) {
        toast('Isi nama lengkap dan pilih kelas terlebih dahulu.');
        return;
      }
      currentAttempt = {
        fullName, grade, subject: lesson.subject, topic: lesson.topic,
        objective: lesson.objective, kkm: Number(lesson.kkm ?? 70),
        totalQuestions: (lesson.questions || []).length, lessonId,
        attemptId: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
      };
      originalStartQuiz(lessonId);
    });
  };

  window.submitQuiz = async function () {
    const form = document.getElementById('quizForm');
    if (!form || !currentAttempt) return originalSubmitQuiz();
    originalSubmitQuiz();
    const resultBox = document.getElementById('quizResult');
    const resultText = resultBox?.querySelector('.result')?.innerText || '';
    const scoreMatch = resultText.match(/Nilaimu:\s*(\d+)%/);
    if (!scoreMatch) return;

    const attempt = { ...currentAttempt, score: Number(scoreMatch[1]), passed: resultText.includes('KKM tercapai'), submittedAt: new Date().toISOString() };
    const status = document.createElement('div');
    status.className = 'manage-note';
    status.setAttribute('role', 'status');
    status.textContent = 'Mengirim hasil ujian ke Google Drive…';
    resultBox.appendChild(status);

    async function send() {
      status.textContent = 'Mengirim hasil ujian ke Google Drive…';
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('Sesi siswa belum siap. Muat ulang halaman dan coba lagi.');
        const response = await fetch('/api/submit-test', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` }, body: JSON.stringify(attempt) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Pengiriman gagal.');
        status.textContent = 'Hasil ujian berhasil dikirim ke Google Drive guru.';
        status.style.color = '#427357';
        resultBox.querySelector('[data-retry-drive]')?.remove();
      } catch (error) {
        status.textContent = `Nilai sudah dihitung, tetapi belum tercatat di Google Drive. ${error.message}`;
        status.style.color = '#b24840';
        if (!resultBox.querySelector('[data-retry-drive]')) {
          const retryButton = document.createElement('button');
          retryButton.className = 'smallbtn secondary'; retryButton.type = 'button';
          retryButton.dataset.retryDrive = 'true'; retryButton.textContent = 'Kirim ulang hasil';
          retryButton.style.marginTop = '8px'; retryButton.addEventListener('click', send);
          resultBox.appendChild(retryButton);
        }
      }
    }
    await send();
  };
})();

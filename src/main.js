import { parseQuestionText } from './session-parser.js';
import { questions as defaultQuestions } from './questions.js';

const app = document.querySelector('#app');
const storageKey = 'ubq-quiz-questions-v1';
const sessionsKey = 'ubq-quiz-sessions-v1';
const activeSessionKey = 'ubq-quiz-active-session-v1';
const resultsKey = 'ubq-quiz-results-v1';
const adminPassword = '654321';
const adminSessionKey = 'ubq-quiz-admin-access';
let quizQuestions = loadQuestions();
let activeSessionName = localStorage.getItem(activeSessionKey) || '';
let currentQuestion = 0;
let score = 0;
let playerName = '';
let timerId;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]); }
function normalizeQuestion(question) {
  if (!question || typeof question.question !== 'string' || !Array.isArray(question.answers) || question.answers.length !== 4) return null;
  const answers = question.answers.map((answer) => String(answer).trim());
  const correct = Number(question.correct);
  const time = Math.max(5, Math.min(120, Number(question.time) || 20));
  if (!question.question.trim() || answers.some((answer) => !answer) || !Number.isInteger(correct) || correct < 0 || correct > 3) return null;
  return { question: question.question.trim(), answers, correct, time };
}
function loadQuestions() {
  try { const saved = JSON.parse(localStorage.getItem(storageKey)); if (Array.isArray(saved)) { const valid = saved.map(normalizeQuestion).filter(Boolean); if (valid.length) return valid; } } catch { /* defaults */ }
  return clone(defaultQuestions);
}
function saveQuestions() {
  localStorage.setItem(storageKey, JSON.stringify(quizQuestions));
  if (!activeSessionName) return;
  const sessions = loadSessions();
  const session = sessions.find(item => item.name === activeSessionName);
  if (!session) { setActiveSession(''); return; }
  session.questions = clone(quizQuestions);
  session.updatedAt = new Date().toISOString();
  localStorage.setItem(sessionsKey, JSON.stringify(sessions));
}
function setActiveSession(name) { activeSessionName = name; localStorage.setItem(activeSessionKey, name); }
function renderSessionSelector() {
  const sessions = loadSessions();
  if (!sessions.some(session => session.name === activeSessionName)) setActiveSession('');
  const panel = document.querySelector('#session-selector');
  panel.innerHTML = `<label for="session-to-edit">Escolher sessão para editar</label><select id="session-to-edit"><option value="">${activeSessionName ? 'Escolher outra sessão…' : 'Perguntas atuais (sem sessão selecionada)'}</option>${sessions.map((session, index) => `<option value="${index}" ${session.name === activeSessionName ? 'selected' : ''}>${escapeHtml(session.name)}</option>`).join('')}</select><p id="active-session-status" role="status">${activeSessionName ? `A editar: <strong>${escapeHtml(activeSessionName)}</strong>. As alterações são guardadas automaticamente nesta sessão.` : sessions.length ? 'Seleciona uma sessão para carregar as suas perguntas.' : 'Ainda não há sessões. Importa um PDF/JSON ou usa Guardar sessão.'}</p>`;
  panel.querySelector('#session-to-edit').addEventListener('change', event => {
    if (event.target.value === '') { setActiveSession(''); renderSessionSelector(); return; }
    const selected = sessions[Number(event.target.value)];
    const current = loadSessions().find(session => session.name === selected?.name);
    const valid = Array.isArray(current?.questions) ? current.questions.map(normalizeQuestion) : [];
    if (!valid.length || valid.some(question => !question)) {
      window.alert('Esta sessão não contém perguntas válidas.'); renderSessionSelector(); return;
    }
    quizQuestions = clone(valid);
    setActiveSession(current.name);
    saveQuestions();
    renderAdmin();
  });
}
function loadSessions() { try { const saved = JSON.parse(localStorage.getItem(sessionsKey)); return Array.isArray(saved) ? saved : []; } catch { return []; } }
function loadResults() { try { const saved = JSON.parse(localStorage.getItem(resultsKey)); return Array.isArray(saved) ? saved : []; } catch { return []; } }
function saveIndividualResult() { const results = loadResults(); results.unshift({ name: playerName || 'Ciclista', score, total: quizQuestions.length, completedAt: new Date().toISOString() }); localStorage.setItem(resultsKey, JSON.stringify(results).slice(0, 50000)); }
function saveSession() { const name = window.prompt('Nome da sessão de quiz:', activeSessionName || `Sessão ${new Date().toLocaleDateString('pt-PT')}`)?.trim(); if (!name) return; const sessions = loadSessions().filter(session => session.name !== name); sessions.push({ name, questions: clone(quizQuestions), updatedAt: new Date().toISOString() }); localStorage.setItem(sessionsKey, JSON.stringify(sessions)); setActiveSession(name); renderSavedSessions(); renderSessionSelector(); document.querySelector('#save-status').textContent = `Sessão “${name}” guardada.`; }
function exportSession() { const name = window.prompt('Nome do ficheiro da sessão:', 'ubq-sessao-quiz')?.trim() || 'ubq-sessao-quiz'; const payload = { type: 'ubq-quiz-session', name, questions: quizQuestions, updatedAt: new Date().toISOString() }; const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${name.replace(/[^a-z0-9-_]+/gi, '-')}.json`; link.click(); URL.revokeObjectURL(url); }
function parseOcrSession(data) { const items = Array.isArray(data?.detail) ? data.detail : Array.isArray(data?.pages) ? data.pages.flatMap(page => page.content || []) : []; return parseQuestionText(items.map(item => String(item.text || '')).join('\n')); }
function parseTextSession(text) { return parseQuestionText(text); }
async function extractPdfText(file) { const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'; const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise; const pages = []; for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) { const page = await pdf.getPage(pageNumber); const content = await page.getTextContent(); pages.push(content.items.map(item => item.str).join('\n')); } return pages.join('\n'); }
function adminUrl() { const url = new URL(window.location.href); url.search = '?admin'; return url.href; }
function quizUrl() { const url = new URL(window.location.href); url.search = ''; return url.href; }
function brand() { return '<header class="brand"><span class="brand-mark">U</span><div><strong>UBQ</strong><small>QUIZ</small></div></header>'; }

function renderHome() {
  clearInterval(timerId);
  app.innerHTML = `<div class="shell">${brand()}<section class="hero"><div class="eyebrow">Quiz da comunidade</div><h1>Quiz UBQ</h1><p>Um quiz rápido para aprender, desafiar a equipa e descobrir quem sabe mais.</p></section><section class="setup-panel"><form id="entry-form"><label for="name-input">Como te chamamos?</label><input id="name-input" maxlength="24" placeholder="O teu nome" required autofocus /><button class="primary-button" type="submit">Começar o quiz <b>→</b></button></form><p class="prototype-note">${quizQuestions.length} perguntas · responde antes de o tempo acabar</p></section><footer><span>Partilha este link com a equipa</span><span>•</span><a href="${escapeHtml(adminUrl())}">Modo administração</a></footer></div>`;
  document.querySelector('#entry-form').addEventListener('submit', (event) => { event.preventDefault(); playerName = document.querySelector('#name-input').value.trim() || 'Ciclista'; currentQuestion = 0; score = 0; renderQuiz(); });
}
function renderQuiz() {
  clearInterval(timerId); const question = quizQuestions[currentQuestion]; if (!question) return renderResult(); const progress = (currentQuestion / quizQuestions.length) * 100;
  app.innerHTML = `<div class="shell quiz-shell"><header class="quiz-header">${brand()}<div class="player-chip"><span>${escapeHtml(playerName)}</span><b>${String(score).padStart(3, '0')}</b></div></header><div class="progress-track"><span style="width:${progress}%"></span></div><main class="question-stage"><div class="question-meta"><span>Pergunta ${currentQuestion + 1} de ${quizQuestions.length}</span><span class="time-badge" id="timer">${question.time}s</span></div><h1>${escapeHtml(question.question)}</h1><div class="answer-grid">${question.answers.map((answer, index) => `<button class="answer-button answer-${index}" data-answer="${index}" type="button"><span>${String.fromCharCode(65 + index)}</span>${escapeHtml(answer)}</button>`).join('')}</div></main><div class="quiz-footer"><span>Olá, ${escapeHtml(playerName)}.</span><span>Escolhe a resposta certa</span></div></div>`;
  let remaining = question.time;
  timerId = setInterval(() => { remaining -= 1; const timer = document.querySelector('#timer'); if (timer) timer.textContent = `${remaining}s`; if (remaining <= 0) answerQuestion(-1, remaining); }, 1000);
  document.querySelectorAll('[data-answer]').forEach((button) => button.addEventListener('click', () => answerQuestion(Number(button.dataset.answer), remaining)));
}
function answerQuestion(answer, remaining) {
  if (!timerId) return; clearInterval(timerId); timerId = null; const question = quizQuestions[currentQuestion]; const buttons = document.querySelectorAll('[data-answer]');
  buttons.forEach((button) => { button.disabled = true; if (Number(button.dataset.answer) === question.correct) button.classList.add('correct'); }); const chosen = document.querySelector(`[data-answer="${answer}"]`);
  if (answer === question.correct) { score += 100 + Math.max(0, remaining) * 5; chosen.classList.add('selected-correct'); } else if (chosen) chosen.classList.add('selected-wrong');
  setTimeout(() => { currentQuestion += 1; renderQuiz(); }, 850);
}
function renderResult() {
  clearInterval(timerId); saveIndividualResult(); const maxScore = quizQuestions.reduce((total, question) => total + 100 + question.time * 5, 0);
  app.innerHTML = `<div class="shell result-shell">${brand()}<main class="result-card"><div class="eyebrow">Quiz concluído</div><h1>Boa, ${escapeHtml(playerName || 'jogador')}!</h1><p>Terminaste o Quiz UBQ.</p><div class="score-display"><small>A tua pontuação</small><strong>${String(score).padStart(3, '0')}</strong><span>até ${maxScore} pontos</span></div><button id="restart-button" class="primary-button" type="button">Jogar novamente <b>→</b></button></main></div>`;
  document.querySelector('#restart-button').addEventListener('click', renderHome);
}
function renderAdminLogin() {
  clearInterval(timerId);
  app.innerHTML = `<div class="shell result-shell">${brand()}<main class="result-card admin-login"><div class="eyebrow">Área reservada</div><h1>Modo administração</h1><p>Introduz a senha para gerir as perguntas e respostas do quiz.</p><form id="admin-login-form"><label for="admin-password">Senha</label><input id="admin-password" type="password" inputmode="numeric" autocomplete="current-password" required autofocus /><p id="admin-error" class="admin-error" hidden>Senha incorreta. Tenta novamente.</p><button class="primary-button" type="submit">Entrar <b>→</b></button></form></main></div>`;
  document.querySelector('#admin-login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (document.querySelector('#admin-password').value === adminPassword) { sessionStorage.setItem(adminSessionKey, 'true'); renderAdmin(); return; }
    document.querySelector('#admin-error').hidden = false;
  });
}
function renderAdmin() {
  clearInterval(timerId);
  const results = loadResults(); app.innerHTML = `<div class="shell admin-shell">${brand()}<header class="admin-header"><div><div class="eyebrow">Área de administração</div><h1>Perguntas do quiz</h1><p>Altera, adiciona ou remove perguntas e guarda sessões para usar no Live.</p></div><a class="secondary-button" href="${escapeHtml(quizUrl())}">Ver quiz →</a></header><section id="session-selector" class="session-selector"></section><div class="admin-actions"><a class="secondary-button" href="./aberto/?admin">Sala com prazo</a><button id="add-question" class="primary-button" type="button">+ Adicionar pergunta</button><button id="save-session" class="secondary-button" type="button">Guardar sessão</button><button id="export-session" class="secondary-button" type="button">Exportar sessão JSON</button><label class="secondary-button import-label">Importar sessão PDF/JSON<input id="import-session" type="file" accept="application/pdf,application/json,.pdf,.json" hidden /></label><button id="export-questions" class="secondary-button" type="button">Exportar perguntas</button><label class="secondary-button import-label">Importar perguntas<input id="import-questions" type="file" accept="application/json" hidden /></label><button id="delete-session" class="text-button" type="button">Apagar sessão</button></div><p class="save-status" id="save-status">${quizQuestions.length} perguntas guardadas neste browser.</p><dialog id="saved-sessions" class="session-dialog" aria-labelledby="saved-sessions-title"></dialog><section class="results-panel"><div class="eyebrow">Resultados individuais</div><h2>Jogadores concluídos</h2><ol>${results.map(result => `<li><span>${escapeHtml(result.name)} · ${new Date(result.completedAt).toLocaleString('pt-PT')}</span><strong>${result.score} pts</strong></li>`).join('') || '<li>Ainda não há resultados.</li>'}</ol></section><section id="question-editor" class="question-editor"></section></div>`;
  renderSavedSessions();
  renderSessionSelector();
  renderQuestionEditor();
  document.querySelector('#add-question').addEventListener('click', () => { quizQuestions.push({ question: 'Nova pergunta', answers: ['Resposta A', 'Resposta B', 'Resposta C', 'Resposta D'], correct: 0, time: 20 }); saveQuestions(); renderAdmin(); });
  document.querySelector('#save-session').addEventListener('click', saveSession);
  document.querySelector('#export-session').addEventListener('click', exportSession);
  document.querySelector('#import-session').addEventListener('change', importSession);
  document.querySelector('#export-questions').addEventListener('click', exportQuestions);
  document.querySelector('#import-questions').addEventListener('change', importQuestions);
  document.querySelector('#delete-session').addEventListener('click', () => { renderSavedSessions(); document.querySelector('#saved-sessions').showModal(); });
}
function renderSavedSessions() {
  const panel = document.querySelector('#saved-sessions');
  const sessions = loadSessions();
  panel.innerHTML = `<h2 id="saved-sessions-title">Apagar sessão</h2><p>Escolhe a sessão a apagar deste navegador. As perguntas atuais no editor mantêm-se.</p>${sessions.length ? `<label for="session-to-delete">Sessão</label><select id="session-to-delete">${sessions.map((session, index) => `<option value="${index}">${escapeHtml(session.name)} (${Array.isArray(session.questions) ? session.questions.length : 0} perguntas)</option>`).join('')}</select>` : '<p>Ainda não há sessões guardadas.</p>'}<div class="session-dialog-actions"><button id="cancel-delete-session" class="secondary-button" type="button">Cancelar</button><button id="confirm-delete-session" class="delete-button" type="button" ${sessions.length ? '' : 'disabled'}>Apagar sessão</button></div><p id="session-delete-status" role="status"></p>`;
  panel.querySelector('#cancel-delete-session').addEventListener('click', () => panel.close());
  panel.querySelector('#confirm-delete-session').addEventListener('click', () => {
    const index = Number(panel.querySelector('#session-to-delete')?.value);
    const session = sessions[index];
    if (!session) return;
    if (!window.confirm(`Apagar a sessão "${session.name}" deste navegador? Esta ação não pode ser desfeita.`)) return;
    try {
      const currentSessions = loadSessions();
      if (JSON.stringify(currentSessions) !== JSON.stringify(sessions)) {
        renderSavedSessions();
        panel.querySelector('#session-delete-status').textContent = 'A lista de sessões foi alterada. Seleciona novamente a sessão a apagar.';
        return;
      }
      currentSessions.splice(index, 1);
      localStorage.setItem(sessionsKey, JSON.stringify(currentSessions));
      if (session.name === activeSessionName) setActiveSession('');
      panel.close();
      renderSavedSessions();
      renderSessionSelector();
      document.querySelector('#save-status').textContent = `Sessão "${session.name}" apagada.`;
    } catch {
      window.alert('Não foi possível apagar a sessão. Tenta novamente.');
    }
  });
}
function renderQuestionEditor() {
  const editor = document.querySelector('#question-editor');
  editor.innerHTML = quizQuestions.map((question, index) => `<article class="editor-card" data-index="${index}"><div class="editor-card-header"><strong>Pergunta ${index + 1}</strong><button class="delete-button" type="button" data-delete="${index}" ${quizQuestions.length === 1 ? 'disabled' : ''}>Remover</button></div><label>Pergunta<textarea data-field="question" rows="2">${escapeHtml(question.question)}</textarea></label><div class="answer-fields">${question.answers.map((answer, answerIndex) => `<label>Resposta ${String.fromCharCode(65 + answerIndex)}<input data-field="answer" data-answer-index="${answerIndex}" value="${escapeHtml(answer)}" /></label>`).join('')}</div><div class="editor-options"><label>Resposta certa<select data-field="correct">${question.answers.map((_, answerIndex) => `<option value="${answerIndex}" ${question.correct === answerIndex ? 'selected' : ''}>Resposta ${String.fromCharCode(65 + answerIndex)}</option>`).join('')}</select></label><label>Tempo (segundos)<input data-field="time" type="number" min="5" max="120" value="${question.time}" /></label></div></article>`).join('');
  editor.addEventListener('input', handleEditorChange); editor.addEventListener('change', handleEditorChange);
  editor.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => { quizQuestions.splice(Number(button.dataset.delete), 1); saveQuestions(); renderAdmin(); }));
}
function handleEditorChange(event) { const field = event.target.dataset.field; if (!field) return; const index = Number(event.target.closest('.editor-card').dataset.index); const question = quizQuestions[index]; if (field === 'answer') question.answers[Number(event.target.dataset.answerIndex)] = event.target.value; else if (field === 'correct' || field === 'time') question[field] = Number(event.target.value); else question[field] = event.target.value; saveQuestions(); document.querySelector('#save-status').textContent = `Alterações guardadas · ${quizQuestions.length} perguntas.`; }
function exportQuestions() { const blob = new Blob([JSON.stringify(quizQuestions, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'ubq-quiz-perguntas.json'; link.click(); URL.revokeObjectURL(url); }
function importQuestions(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const loaded = JSON.parse(reader.result); const valid = Array.isArray(loaded) ? loaded.map(normalizeQuestion).filter(Boolean) : []; if (!valid.length || valid.length !== loaded.length) throw new Error(); setActiveSession(''); quizQuestions = valid; saveQuestions(); renderAdmin(); } catch { window.alert('O ficheiro não contém perguntas válidas.'); } }; reader.readAsText(file); }
async function importSession(event) { const file = event.target.files[0]; if (!file) return; try { const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name); const raw = isPdf ? parseTextSession(await extractPdfText(file)) : JSON.parse(await file.text()); const loaded = isPdf ? null : raw; const source = Array.isArray(raw) ? raw : raw?.questions; const imported = source || (isPdf ? raw : parseOcrSession(raw)); const questions = imported.map(normalizeQuestion).filter(Boolean); if (!questions.length || questions.length !== imported.length) throw new Error(); setActiveSession(''); quizQuestions = questions; saveQuestions(); const name = loaded?.name || (isPdf ? file.name.replace(/\.pdf$/i, '') : 'Quiz UBQ importado'); const sessions = loadSessions().filter(session => session.name !== name); sessions.push({ name, questions, updatedAt: new Date().toISOString() }); localStorage.setItem(sessionsKey, JSON.stringify(sessions)); setActiveSession(name); renderAdmin(); } catch (error) { window.alert('Não foi possível importar este PDF/JSON como sessão de quiz.' + (error?.message ? '\n' + error.message : '')); } finally { event.target.value = ''; } }
if (new URLSearchParams(window.location.search).has('admin')) {
  if (sessionStorage.getItem(adminSessionKey) === 'true') renderAdmin(); else renderAdminLogin();
} else renderHome();



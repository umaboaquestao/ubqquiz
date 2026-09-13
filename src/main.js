import { questions as defaultQuestions } from './questions.js';

const app = document.querySelector('#app');
const storageKey = 'ubq-quiz-questions-v1';
const sessionsKey = 'ubq-quiz-sessions-v1';
const resultsKey = 'ubq-quiz-results-v1';
const adminPassword = '654321';
const adminSessionKey = 'ubq-quiz-admin-access';
let quizQuestions = loadQuestions();
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
function saveQuestions() { localStorage.setItem(storageKey, JSON.stringify(quizQuestions)); }
function loadSessions() { try { const saved = JSON.parse(localStorage.getItem(sessionsKey)); return Array.isArray(saved) ? saved : []; } catch { return []; } }
function loadResults() { try { const saved = JSON.parse(localStorage.getItem(resultsKey)); return Array.isArray(saved) ? saved : []; } catch { return []; } }
function saveIndividualResult() { const results = loadResults(); results.unshift({ name: playerName || 'Ciclista', score, total: quizQuestions.length, completedAt: new Date().toISOString() }); localStorage.setItem(resultsKey, JSON.stringify(results).slice(0, 50000)); }
function saveSession() { const name = window.prompt('Nome da sessão de quiz:', `Sessão ${new Date().toLocaleDateString('pt-PT')}`)?.trim(); if (!name) return; const sessions = loadSessions().filter(session => session.name !== name); sessions.push({ name, questions: clone(quizQuestions), updatedAt: new Date().toISOString() }); localStorage.setItem(sessionsKey, JSON.stringify(sessions)); document.querySelector('#save-status').textContent = `Sessão “${name}” guardada.`; }
function exportSession() { const name = window.prompt('Nome do ficheiro da sessão:', 'ubq-sessao-quiz')?.trim() || 'ubq-sessao-quiz'; const payload = { type: 'ubq-quiz-session', name, questions: quizQuestions, updatedAt: new Date().toISOString() }; const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${name.replace(/[^a-z0-9-_]+/gi, '-')}.json`; link.click(); URL.revokeObjectURL(url); }
function parseOcrSession(data) { const items = Array.isArray(data?.detail) ? data.detail : Array.isArray(data?.pages) ? data.pages.flatMap(page => page.content || []) : []; const parsed = []; let current = null; for (const item of items) { const text = String(item.text || '').trim(); if (!text || /^Quiz\s+TIMI/i.test(text)) continue; const questionMatch = text.match(/^\d+\.\s*(.+)$/); const answerMatch = text.match(/^([A-D])\)\s*(.+)$/i); if (questionMatch) { if (current) parsed.push(current); current = { question: questionMatch[1].trim(), answers: [], correct: 0, time: 20 }; } else if (answerMatch && current) { current.answers[answerMatch[1].toUpperCase().charCodeAt(0) - 65] = answerMatch[2].trim(); } else if (current && !current.answers.length) { current.question += ` ${text}`; } else if (current && current.answers.length < 4) { const last = current.answers.length - 1; current.answers[last] = `${current.answers[last]} ${text}`.trim(); } } if (current) parsed.push(current); return parsed.filter(question => question.question && question.answers.length === 4 && question.answers.every(Boolean)); }
function parseTextSession(text) { return parseOcrSession({ detail: text.split(/\r?\n/).map((line, index) => ({ id: index, text: line })) }); }
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
  const results = loadResults(); app.innerHTML = `<div class="shell admin-shell">${brand()}<header class="admin-header"><div><div class="eyebrow">Área de administração</div><h1>Perguntas do quiz</h1><p>Altera, adiciona ou remove perguntas e guarda sessões para usar no Live.</p></div><a class="secondary-button" href="${escapeHtml(quizUrl())}">Ver quiz →</a></header><div class="admin-actions"><button id="add-question" class="primary-button" type="button">+ Adicionar pergunta</button><button id="save-session" class="secondary-button" type="button">Guardar sessão</button><button id="export-session" class="secondary-button" type="button">Exportar sessão JSON</button><label class="secondary-button import-label">Importar sessão PDF/JSON<input id="import-session" type="file" accept="application/pdf,application/json,.pdf,.json" hidden /></label><button id="export-questions" class="secondary-button" type="button">Exportar perguntas</button><label class="secondary-button import-label">Importar perguntas<input id="import-questions" type="file" accept="application/json" hidden /></label><button id="reset-questions" class="text-button" type="button">Repor originais</button></div><p class="save-status" id="save-status">${quizQuestions.length} perguntas guardadas neste browser.</p><section class="results-panel"><div class="eyebrow">Resultados individuais</div><h2>Jogadores concluídos</h2><ol>${results.map(result => `<li><span>${escapeHtml(result.name)} · ${new Date(result.completedAt).toLocaleString('pt-PT')}</span><strong>${result.score} pts</strong></li>`).join('') || '<li>Ainda não há resultados.</li>'}</ol></section><section id="question-editor" class="question-editor"></section></div>`;
  renderQuestionEditor();
  document.querySelector('#add-question').addEventListener('click', () => { quizQuestions.push({ question: 'Nova pergunta', answers: ['Resposta A', 'Resposta B', 'Resposta C', 'Resposta D'], correct: 0, time: 20 }); saveQuestions(); renderAdmin(); });
  document.querySelector('#save-session').addEventListener('click', saveSession);
  document.querySelector('#export-session').addEventListener('click', exportSession);
  document.querySelector('#import-session').addEventListener('change', importSession);
  document.querySelector('#export-questions').addEventListener('click', exportQuestions);
  document.querySelector('#import-questions').addEventListener('change', importQuestions);
  document.querySelector('#reset-questions').addEventListener('click', () => { if (window.confirm('Repor as perguntas originais? As alterações deste browser serão substituídas.')) { quizQuestions = clone(defaultQuestions); saveQuestions(); renderAdmin(); } });
}
function renderQuestionEditor() {
  const editor = document.querySelector('#question-editor');
  editor.innerHTML = quizQuestions.map((question, index) => `<article class="editor-card" data-index="${index}"><div class="editor-card-header"><strong>Pergunta ${index + 1}</strong><button class="delete-button" type="button" data-delete="${index}" ${quizQuestions.length === 1 ? 'disabled' : ''}>Remover</button></div><label>Pergunta<textarea data-field="question" rows="2">${escapeHtml(question.question)}</textarea></label><div class="answer-fields">${question.answers.map((answer, answerIndex) => `<label>Resposta ${String.fromCharCode(65 + answerIndex)}<input data-field="answer" data-answer-index="${answerIndex}" value="${escapeHtml(answer)}" /></label>`).join('')}</div><div class="editor-options"><label>Resposta certa<select data-field="correct">${question.answers.map((_, answerIndex) => `<option value="${answerIndex}" ${question.correct === answerIndex ? 'selected' : ''}>Resposta ${String.fromCharCode(65 + answerIndex)}</option>`).join('')}</select></label><label>Tempo (segundos)<input data-field="time" type="number" min="5" max="120" value="${question.time}" /></label></div></article>`).join('');
  editor.addEventListener('input', handleEditorChange); editor.addEventListener('change', handleEditorChange);
  editor.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => { quizQuestions.splice(Number(button.dataset.delete), 1); saveQuestions(); renderAdmin(); }));
}
function handleEditorChange(event) { const field = event.target.dataset.field; if (!field) return; const index = Number(event.target.closest('.editor-card').dataset.index); const question = quizQuestions[index]; if (field === 'answer') question.answers[Number(event.target.dataset.answerIndex)] = event.target.value; else if (field === 'correct' || field === 'time') question[field] = Number(event.target.value); else question[field] = event.target.value; saveQuestions(); document.querySelector('#save-status').textContent = `Alterações guardadas · ${quizQuestions.length} perguntas.`; }
function exportQuestions() { const blob = new Blob([JSON.stringify(quizQuestions, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'ubq-quiz-perguntas.json'; link.click(); URL.revokeObjectURL(url); }
function importQuestions(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const loaded = JSON.parse(reader.result); const valid = Array.isArray(loaded) ? loaded.map(normalizeQuestion).filter(Boolean) : []; if (!valid.length || valid.length !== loaded.length) throw new Error(); quizQuestions = valid; saveQuestions(); renderAdmin(); } catch { window.alert('O ficheiro não contém perguntas válidas.'); } }; reader.readAsText(file); }
async function importSession(event) { const file = event.target.files[0]; if (!file) return; try { const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name); const raw = isPdf ? parseTextSession(await extractPdfText(file)) : JSON.parse(await file.text()); const loaded = isPdf ? null : raw; const source = Array.isArray(raw) ? raw : raw?.questions; const imported = source || (isPdf ? raw : parseOcrSession(raw)); const questions = imported.map(normalizeQuestion).filter(Boolean); if (!questions.length || questions.length !== imported.length) throw new Error(); quizQuestions = questions; saveQuestions(); const name = loaded?.name || (isPdf ? file.name.replace(/\.pdf$/i, '') : 'Quiz TIMI importado'); const sessions = loadSessions().filter(session => session.name !== name); sessions.push({ name, questions, updatedAt: new Date().toISOString() }); localStorage.setItem(sessionsKey, JSON.stringify(sessions)); renderAdmin(); } catch { window.alert('Não foi possível importar este PDF/JSON como sessão de quiz.'); } }
if (new URLSearchParams(window.location.search).has('admin')) {
  if (sessionStorage.getItem(adminSessionKey) === 'true') renderAdmin(); else renderAdminLogin();
} else renderHome();



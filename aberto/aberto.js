import { questions as defaults } from '../src/questions.js';

const app = document.querySelector('#app');
const params = new URLSearchParams(location.search);
const escape = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const date = value => new Date(value).toLocaleString('pt-PT');
let client, game, roomCode, playerToken, refresh;
async function rpc(name, args) {
  if (!client) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    client = createClient('https://zwyvepsxmerblrwfqtxw.supabase.co', 'sb_publishable_mUTBuM4Ycd6XyRf0I2hBbA_WMCda7eb');
  }
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message.includes('schema cache') ? 'Este modo ainda precisa da atualização da base de dados. Contacta o administrador.' : error.message);
  return data;
}
function screen(content) {
  clearInterval(refresh);
  app.innerHTML = `<div class="shell"><header class="brand"><span class="brand-mark">U</span><strong>UBQ · Sala com prazo</strong></header><main class="question-stage">${content}</main><footer><a href="../?admin">Gerir perguntas e sessões</a><a href="../live/?admin">Modo Live</a></footer></div>`;
}
function bindForm(id, action) {
  document.querySelector(id).addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    button.disabled = true;
    try { await action(); } catch (error) { window.alert(error.message); } finally { button.disabled = false; }
  });
}
function quizzes() {
  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const current = read('ubq-quiz-questions-v1');
  const saved = read('ubq-quiz-sessions-v1');
  return [{ name: 'Quiz UBQ original', questions: defaults }, ...(Array.isArray(current) && current.length ? [{ name: 'Perguntas atuais do editor', questions: current }] : []), ...(Array.isArray(saved) ? saved.filter(s => Array.isArray(s.questions) && s.questions.length) : [])];
}
function setup() {
  const choices = quizzes();
  screen(`<h1>Criar sala com prazo</h1><p>Cada pessoa responde ao seu ritmo até ao fecho. Cada resposta certa vale 100 pontos, sem bónus de velocidade.</p><form id="create"><label for="quiz">Quiz</label><select id="quiz">${choices.map((q, i) => `<option value="${i}">${escape(q.name)} (${q.questions.length} perguntas)</option>`).join('')}</select><label for="hours">Durante quanto tempo fica aberta?</label><select id="hours"><option value="1">1 hora</option><option value="6">6 horas</option><option value="24" selected>24 horas</option><option value="72">3 dias</option><option value="168">7 dias</option><option value="custom">Escolher data e hora</option></select><label for="deadline">Data e hora de fecho (hora local)</label><input id="deadline" type="datetime-local" disabled><button class="primary-button">Criar sala</button></form><section><h2>Consultar classificação</h2><form id="find"><label for="find-code">Código da sala</label><input id="find-code" required maxlength="12"><button class="secondary-button">Ver tabela</button></form></section>`);
  document.querySelector('#hours').onchange = event => { document.querySelector('#deadline').disabled = event.target.value !== 'custom'; document.querySelector('#deadline').required = event.target.value === 'custom'; };
  bindForm('#create', async () => {
    const hours = document.querySelector('#hours').value;
    const end = hours === 'custom' ? new Date(document.querySelector('#deadline').value) : new Date(Date.now() + Number(hours) * 3600000);
    if (!Number.isFinite(end.getTime()) || end <= new Date()) throw new Error('Escolhe uma data de fecho no futuro.');
    const quiz = choices[Number(document.querySelector('#quiz').value)];
    const room = await rpc('create_open_quiz', { p_title: quiz.name, p_questions: quiz.questions, p_closes_at: end.toISOString() });
    history.replaceState(null, '', `?admin&room=${encodeURIComponent(room.room_code)}`);
    await leaderboard(room.room_code);
  });
  bindForm('#find', () => leaderboard(document.querySelector('#find-code').value.trim().toUpperCase()));
}
function login() {
  if (sessionStorage.getItem('ubq-quiz-admin-access') === 'true') return params.get('room') ? leaderboard(params.get('room')).catch(e => window.alert(e.message)) : setup();
  screen('<h1>Administração</h1><form id="login"><label for="password">Senha</label><input id="password" type="password" required><button class="primary-button">Entrar</button></form>');
  bindForm('#login', async () => {
    if (document.querySelector('#password').value !== '654321') throw new Error('Senha incorreta.');
    sessionStorage.setItem('ubq-quiz-admin-access', 'true');
    setup();
  });
}
function entry() {
  screen(`<h1>Joga quando puderes</h1><p>Responde ao teu ritmo enquanto a sala estiver aberta. Os resultados de todos aparecem na mesma tabela.</p><form id="join"><label for="code">Código da sala</label><input id="code" required maxlength="12" value="${escape(params.get('room') || '')}"><label for="name">O teu nome</label><input id="name" required maxlength="24"><button class="primary-button">Entrar e responder</button></form><a href="?admin">Criar sala com prazo</a>`);
  bindForm('#join', async () => {
    roomCode = document.querySelector('#code').value.trim().toUpperCase();
    const name = document.querySelector('#name').value.trim();
    if (!name) throw new Error('Introduz o teu nome.');
    playerToken = localStorage.getItem(`ubq-open-token-${roomCode}`) || crypto.randomUUID();
    localStorage.setItem(`ubq-open-token-${roomCode}`, playerToken);
    game = await rpc('join_open_quiz', { p_code: roomCode, p_name: name, p_token: playerToken });
    play();
  });
  const boardButton = document.createElement('button');
  boardButton.type = 'button';
  boardButton.className = 'secondary-button';
  boardButton.textContent = 'Ver classificação';
  document.querySelector('#join').append(boardButton);
  boardButton.onclick = async () => {
    boardButton.disabled = true;
    try {
      const code = document.querySelector('#code').value.trim().toUpperCase();
      if (!code) throw new Error('Introduz o código da sala.');
      await leaderboard(code);
    } catch (error) { window.alert(error.message); } finally { boardButton.disabled = false; }
  };
}
function play() {
  if (game.next_index >= game.questions.length || new Date(game.closes_at) <= new Date()) return leaderboard(roomCode).catch(e => window.alert(e.message));
  const question = game.questions[game.next_index];
  screen(`<p>Fecha em ${escape(date(game.closes_at))} · ${game.score} pontos</p><div class="question-meta">Pergunta ${game.next_index + 1} de ${game.questions.length}</div><h1>${escape(question.question)}</h1><div class="answer-grid">${question.answers.map((answer, i) => `<button type="button" class="answer-button" data-answer="${i}"><span>${'ABCD'[i]}</span>${escape(answer)}</button>`).join('')}</div><p id="answer-error" role="status"></p>`);
  const deadlineTimer = setTimeout(() => play(), Math.min(2147483647, Math.max(0, new Date(game.closes_at) - Date.now()) + 50));
  document.querySelectorAll('[data-answer]').forEach(button => button.addEventListener('click', async () => {
    document.querySelectorAll('[data-answer]').forEach(b => b.disabled = true);
    try {
      const state = await rpc('answer_open_quiz', { p_code: roomCode, p_token: playerToken, p_index: game.next_index, p_answer: Number(button.dataset.answer) });
      clearTimeout(deadlineTimer);
      game = { ...game, ...state };
      play();
    } catch (error) {
      document.querySelector('#answer-error').textContent = error.message;
      document.querySelectorAll('[data-answer]').forEach(b => b.disabled = false);
    }
  }));
}
async function leaderboard(code) {
  const board = await rpc('open_quiz_board', { p_code: code });
  const link = new URL(location.pathname, location.origin); link.searchParams.set('room', code);
  screen(`<h1>${escape(board.title)}</h1><p>Sala <strong>${escape(code)}</strong> · ${board.closed ? 'Encerrada' : 'Aberta'} · Fecho: ${escape(date(board.closes_at))}</p><label for="share">Link para os participantes</label><input id="share" readonly value="${escape(link.href)}"><h2>Classificação geral</h2><p>100 pontos por resposta certa. Pontuações iguais partilham a posição.</p><div style="overflow-x:auto"><table style="width:100%;text-align:left"><thead><tr><th>Posição</th><th>Participante</th><th>Pontos</th><th>Estado</th></tr></thead><tbody>${board.players.map(p => `<tr><td>${p.position}</td><td>${escape(p.name)}</td><td>${p.score}</td><td>${p.completed ? 'Concluído' : board.closed ? 'Incompleto' : 'A responder'}</td></tr>`).join('') || '<tr><td colspan="4">Ainda não há participantes.</td></tr>'}</tbody></table></div><p id="board-status" role="status">A tabela atualiza a cada 15 segundos.</p><button id="update" class="secondary-button">Atualizar tabela</button>${params.has('admin') ? '<button id="new-room" class="secondary-button">Criar outra sala</button>' : ''}`);
  const update = () => leaderboard(code).catch(error => { const status = document.querySelector('#board-status'); if (status) status.textContent = `Não foi possível atualizar: ${error.message}`; });
  document.querySelector('#update').onclick = update;
  document.querySelector('#share').onclick = event => event.target.select();
  if (params.has('admin')) document.querySelector('#new-room').onclick = setup;
  refresh = setInterval(update, 15000);
}
params.has('admin') ? login() : entry();

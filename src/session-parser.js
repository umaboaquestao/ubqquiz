export function parseQuestionText(text) {
  const questions = [];
  const keys = new Map();
  let current;
  let answerIndex = -1;
  let inKey = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const key = line.match(/^(\d+)[.)]\s*Resposta\s*[:\-]?\s*([A-D])\b/i);
    if (key) { keys.set(Number(key[1]), key[2].toUpperCase().charCodeAt(0) - 65); inKey = true; continue; }
    if (/^(Gabarito|Respostas corretas|Respostas certas|Chave de respostas)\b/i.test(line)) { inKey = true; continue; }
    if (inKey) continue;
    if (/^(?:\d+|(?:Quiz|Questionário)(?:\s+.*)?|UMA BOA QUESTÃO\b.*|Continuação\b.*|\d+ perguntas de escolha múltipla\b.*)$/i.test(line)) continue;
    const question = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (question) {
      current = { number: Number(question[1]), question: question[2], answers: [], correct: 0, time: 20 };
      questions.push(current);
      answerIndex = -1;
      continue;
    }
    if (!current) continue;
    const answer = line.match(/^([A-D])[.)]\s+(.+)$/i);
    if (answer) {
      answerIndex = answer[1].toUpperCase().charCodeAt(0) - 65;
      if (current.answers[answerIndex] !== undefined) throw new Error('Há opções repetidas numa pergunta.');
      current.answers[answerIndex] = answer[2];
    } else if (answerIndex >= 0) {
      current.answers[answerIndex] += ` ${line}`;
    } else {
      current.question += ` ${line}`;
    }
  }
  if (!questions.length) throw new Error('Não foram encontradas perguntas. O PDF deve conter texto selecionável.');
  const numbers = new Set();
  return questions.map(({ number, ...question }) => {
    if (numbers.has(number)) throw new Error('Há números de perguntas repetidos.');
    numbers.add(number);
    if (question.answers.length !== 4 || Array.from({ length: 4 }, (_, i) => question.answers[i]).some(a => !a)) {
      throw new Error(`A pergunta ${number} não tem quatro opções válidas (A, B, C e D).`);
    }
    if (keys.size && !keys.has(number)) throw new Error(`O gabarito não indica a resposta da pergunta ${number}.`);
    return { ...question, correct: keys.get(number) ?? 0 };
  });
}

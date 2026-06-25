const authCard = document.getElementById('authCard');
const authTitle = document.getElementById('authTitle');
const authForm = document.getElementById('authForm');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const toggleAuthBtn = document.getElementById('toggleAuthBtn');
const authMessage = document.getElementById('authMessage');
const appNav = document.getElementById('appNav');
const homeView = document.getElementById('homeView');
const leaderboardView = document.getElementById('leaderboardView');
const adminView = document.getElementById('adminView');
const welcomeUser = document.getElementById('welcomeUser');
const quizList = document.getElementById('quizList');
const quizPlayer = document.getElementById('quizPlayer');
const quizTitle = document.getElementById('quizTitle');
const questionProgress = document.getElementById('questionProgress');
const timerValue = document.getElementById('timerValue');
const questionPrompt = document.getElementById('questionPrompt');
const optionsGrid = document.getElementById('optionsGrid');
const skipQuestionBtn = document.getElementById('skipQuestionBtn');
const quizResult = document.getElementById('quizResult');
const resultText = document.getElementById('resultText');
const restartQuizBtn = document.getElementById('restartQuizBtn');
const viewLeaderboardBtn = document.getElementById('viewLeaderboardBtn');
const leaderboardTable = document.getElementById('leaderboardTable');
const adminNavBtn = document.getElementById('adminNavBtn');
const resetLeaderboardBtn = document.getElementById('resetLeaderboardBtn');
const attemptsTable = document.getElementById('attemptsTable');
const attemptDetailsTable = document.getElementById('attemptDetailsTable');
const addSetForm = document.getElementById('addSetForm');
const adminMessage = document.getElementById('adminMessage');
const setTitle = document.getElementById('setTitle');
const questionInputs = document.getElementById('questionInputs');
const populateDefaultBtn = document.getElementById('populateDefaultBtn');
const logoutBtn = document.getElementById('logoutBtn');

let isRegister = false;
let currentUser = null;
let currentQuiz = null;
let currentQuestions = [];
let currentIndex = 0;
let answers = [];
let timer = null;
let remainingSeconds = 10;

function setView(viewId) {
  [homeView, leaderboardView, adminView].forEach((view) => {
    view.classList.toggle('hidden', view.id !== viewId);
  });
}

function showNav() {
  authCard.classList.add('hidden');
  appNav.classList.remove('hidden');
  homeView.classList.remove('hidden');
}

function hideAllPanels() {
  quizPlayer.classList.add('hidden');
  quizResult.classList.add('hidden');
  leaderboardView.classList.add('hidden');
  adminView.classList.add('hidden');
}

function renderQuizSelection(sets) {
  quizList.innerHTML = '';
  sets.forEach((set) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h3>${set.title}</h3><p>Created: ${new Date(set.created_at).toLocaleDateString()}</p><button class="btn" data-set-id="${set.id}">Start quiz</button>`;
    quizList.appendChild(card);
  });
  quizList.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      startQuiz(Number(button.dataset.setId));
    });
  });
}

function renderLeaderboard(rows) {
  if (!rows || rows.length === 0) {
    leaderboardTable.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding: 16px;">No leaderboard entries yet.</td>
      </tr>
    `;
    return;
  }

  leaderboardTable.innerHTML = rows.map((row) => `
      <tr>
        <td>${row.username}</td>
        <td>${row.quiz_title}</td>
        <td>${row.score}</td>
        <td>${row.correct_count}</td>
        <td>${new Date(row.submitted_at).toLocaleString()}</td>
      </tr>
    `).join('');
}

function renderAdminTables(data) {
  attemptsTable.innerHTML = data.attempts.map((row) => `
      <tr>
        <td>${row.username}</td>
        <td>${row.quiz_title}</td>
        <td>${row.score}</td>
        <td>${row.correct_count}</td>
        <td>${new Date(row.submitted_at).toLocaleString()}</td>
      </tr>
    `).join('');

  attemptDetailsTable.innerHTML = data.details.map((row) => `
      <tr>
        <td>${row.attempt_id}</td>
        <td>${row.prompt}</td>
        <td>${row.selected_option || 'None'}</td>
        <td>${row.correct ? 'Yes' : 'No'}</td>
      </tr>
    `).join('');
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || 'Network error');
  }
  return res.json();
}

async function identifyUser() {
  try {
    const user = await fetchJson('/api/me');
    currentUser = user;
    authCard.classList.add('hidden');
    showNav();
    welcomeUser.textContent = `${user.username} (${user.role})`;
    adminNavBtn.classList.toggle('hidden', user.role !== 'admin');
    loadQuizSets();
  } catch (err) {
    currentUser = null;
    authCard.classList.remove('hidden');
    appNav.classList.add('hidden');
    homeView.classList.add('hidden');
  }
}

async function loadQuizSets() {
  setView('homeView');
  hideAllPanels();
  quizPlayer.classList.add('hidden');
  quizResult.classList.add('hidden');
  try {
    const sets = await fetchJson('/api/quiz-sets');
    renderQuizSelection(sets);
  } catch (err) {
    alert(err.message);
  }
}

async function startQuiz(setId) {
  try {
    const data = await fetchJson(`/api/quiz/${setId}`);
    currentQuiz = data.set;
    currentQuestions = data.questions;
    currentIndex = 0;
    answers = [];
    quizTitle.textContent = currentQuiz.title;
    quizPlayer.classList.remove('hidden');
    quizResult.classList.add('hidden');
    renderQuestion();
  } catch (err) {
    alert(err.message);
  }
}

function renderQuestion() {
  if (currentIndex >= currentQuestions.length) {
    submitQuiz();
    return;
  }

  const question = currentQuestions[currentIndex];
  questionPrompt.textContent = question.prompt;
  questionProgress.textContent = `Question ${currentIndex + 1} of ${currentQuestions.length}`;
  optionsGrid.innerHTML = '';
  remainingSeconds = 10;
  timerValue.textContent = remainingSeconds;

  ['a', 'b', 'c', 'd'].forEach((optionKey) => {
    const label = question[`option_${optionKey}`];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'option-button';
    button.textContent = `${optionKey.toUpperCase()}. ${label}`;
    button.dataset.value = optionKey.toUpperCase();
    button.addEventListener('click', () => chooseAnswer(button.dataset.value));
    optionsGrid.appendChild(button);
  });

  clearInterval(timer);
  timer = setInterval(() => {
    remainingSeconds -= 1;
    timerValue.textContent = remainingSeconds;
    if (remainingSeconds <= 0) {
      clearInterval(timer);
      recordAnswer(null);
    }
  }, 1000);
}

function chooseAnswer(answer) {
  recordAnswer(answer);
}

function recordAnswer(answer) {
  clearInterval(timer);
  const question = currentQuestions[currentIndex];
  answers.push({ questionId: question.id, answer });
  currentIndex += 1;
  if (currentIndex < currentQuestions.length) {
    renderQuestion();
  } else {
    submitQuiz();
  }
}

async function submitQuiz() {
  quizPlayer.classList.add('hidden');
  try {
    const result = await fetchJson('/api/submit-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setId: currentQuiz.id, answers })
    });
    resultText.textContent = `You scored ${result.score} points (${result.correct_count}/${result.total_questions} correct).`;
    quizResult.classList.remove('hidden');
  } catch (err) {
    alert(err.message);
  }
}

async function loadLeaderboard() {
  hideAllPanels();
  setView('leaderboardView');
  try {
    const rows = await fetchJson('/api/leaderboard');
    renderLeaderboard(rows);
  } catch (err) {
    alert(err.message);
  }
}

async function loadAdmin() {
  setView('adminView');
  hideAllPanels();
  adminView.classList.remove('hidden');
  try {
    const data = await fetchJson('/api/admin/attempts');
    renderAdminTables(data);
  } catch (err) {
    alert(err.message);
  }
}

async function resetLeaderboard() {
  if (!confirm('Clear all leaderboard attempts? This cannot be undone.')) return;
  try {
    await fetchJson('/api/admin/leaderboard/reset', { method: 'POST' });
    alert('Leaderboard reset.');
    loadAdmin();
  } catch (err) {
    alert(err.message);
  }
}

function buildQuestionEditor(defaults = []) {
  questionInputs.innerHTML = '';
  const count = defaults.length || 10;
  for (let i = 0; i < count; i += 1) {
    const question = defaults[i] || { prompt: '', option_a: '', option_b: '', option_c: '', option_d: '', answer: 'A' };
    const section = document.createElement('div');
    section.className = 'card';
    section.innerHTML = `
      <h4>Question ${i + 1}</h4>
      <label>Question prompt</label>
      <textarea rows="3" data-key="prompt">${question.prompt}</textarea>
      <label>Option A</label>
      <input data-key="option_a" value="${question.option_a}" />
      <label>Option B</label>
      <input data-key="option_b" value="${question.option_b}" />
      <label>Option C</label>
      <input data-key="option_c" value="${question.option_c}" />
      <label>Option D</label>
      <input data-key="option_d" value="${question.option_d}" />
      <label>Correct answer</label>
      <select data-key="answer">
        <option${question.answer === 'A' ? ' selected' : ''}>A</option>
        <option${question.answer === 'B' ? ' selected' : ''}>B</option>
        <option${question.answer === 'C' ? ' selected' : ''}>C</option>
        <option${question.answer === 'D' ? ' selected' : ''}>D</option>
      </select>
    `;
    questionInputs.appendChild(section);
  }
}

function getNewSetPayload() {
  const questionCards = Array.from(questionInputs.children);
  return {
    title: setTitle.value.trim(),
    questions: questionCards.map((section) => {
      return Array.from(section.querySelectorAll('[data-key]')).reduce((obj, field) => {
        obj[field.dataset.key] = field.value.trim();
        return obj;
      }, {});
    }).filter((q) => q.prompt && q.option_a && q.option_b && q.option_c && q.option_d && q.answer)
  };
}

populateDefaultBtn.addEventListener('click', () => {
  buildQuestionEditor([
    { prompt: 'What is a strong practice for mobile device security?', option_a: 'Use untrusted Wi-Fi', option_b: 'Install any app from unknown sources', option_c: 'Enable automatic updates and MDM', option_d: 'Share passwords with coworkers', answer: 'C' },
    { prompt: 'What does full disk encryption protect?', option_a: 'Files during storage', option_b: 'Only files in the cloud', option_c: 'Only network traffic', option_d: 'Installed apps', answer: 'A' }
  ]);
});

addSetForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = getNewSetPayload();
  if (!payload.title || payload.questions.length === 0) {
    adminMessage.textContent = 'Provide a title and at least one complete question.';
    return;
  }

  try {
    await fetchJson('/api/admin/quiz-sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    adminMessage.style.color = 'green';
    adminMessage.textContent = 'Quiz set created successfully.';
    setTitle.value = '';
    buildQuestionEditor();
    loadAdmin();
  } catch (err) {
    adminMessage.style.color = 'var(--danger)';
    adminMessage.textContent = err.message;
  }
});

toggleAuthBtn.addEventListener('click', () => {
  isRegister = !isRegister;
  authTitle.textContent = isRegister ? 'Create your account' : 'Welcome back';
  authSubmitBtn.textContent = isRegister ? 'Register' : 'Sign in';
  toggleAuthBtn.textContent = isRegister ? 'Login' : 'Register';
  authMessage.textContent = '';
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authMessage.textContent = '';
  const url = isRegister ? '/api/register' : '/api/login';
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    await fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    identifyUser();
  } catch (err) {
    authMessage.textContent = err.message;
  }
});

logoutBtn.addEventListener('click', async () => {
  await fetchJson('/api/logout', { method: 'POST' });
  currentUser = null;
  authCard.classList.remove('hidden');
  appNav.classList.add('hidden');
  homeView.classList.add('hidden');
});

appNav.querySelectorAll('button[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    const view = button.dataset.view;
    if (view === 'home') {
      loadQuizSets();
    } else if (view === 'leaderboard') {
      loadLeaderboard();
    } else if (view === 'admin') {
      loadAdmin();
    }
  });
});

skipQuestionBtn.addEventListener('click', () => recordAnswer(null));
restartQuizBtn.addEventListener('click', loadQuizSets);
viewLeaderboardBtn.addEventListener('click', loadLeaderboard);
resetLeaderboardBtn.addEventListener('click', resetLeaderboard);

buildQuestionEditor();
identifyUser();

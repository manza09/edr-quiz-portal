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

/* ✅ FIX IS HERE */
async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: 'include' // 🔥 IMPORTANT: enables session login
  });

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

  const sets = await fetchJson('/api/quiz-sets');
  renderQuizSelection(sets);
}

function renderQuizSelection(sets) {
  quizList.innerHTML = '';
  sets.forEach((set) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${set.title}</h3>
      <p>Created: ${new Date(set.created_at).toLocaleDateString()}</p>
      <button class="btn" data-set-id="${set.id}">Start quiz</button>
    `;
    quizList.appendChild(card);
  });

  quizList.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      startQuiz(Number(button.dataset.setId));
    });
  });
}

async function startQuiz(setId) {
  const data = await fetchJson(`/api/quiz/${setId}`);
  currentQuiz = data.set;
  currentQuestions = data.questions;
  currentIndex = 0;
  answers = [];

  quizTitle.textContent = currentQuiz.title;
  quizPlayer.classList.remove('hidden');
  quizResult.classList.add('hidden');

  renderQuestion();
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
    button.className = 'option-button';
    button.textContent = `${optionKey.toUpperCase()}. ${label}`;
    button.onclick = () => recordAnswer(optionKey.toUpperCase());
    optionsGrid.appendChild(button);
  });

  clearInterval(timer);
  timer = setInterval(() => {
    remainingSeconds--;
    timerValue.textContent = remainingSeconds;

    if (remainingSeconds <= 0) {
      clearInterval(timer);
      recordAnswer(null);
    }
  }, 1000);
}

function recordAnswer(answer) {
  clearInterval(timer);

  const question = currentQuestions[currentIndex];
  answers.push({
    questionId: question.id,
    answer
  });

  currentIndex++;

  if (currentIndex < currentQuestions.length) {
    renderQuestion();
  } else {
    submitQuiz();
  }
}

async function submitQuiz() {
  quizPlayer.classList.add('hidden');

  const result = await fetchJson('/api/submit-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      setId: currentQuiz.id,
      answers
    })
  });

  resultText.textContent =
    `You scored ${result.score} points (${result.correct_count}/${result.total_questions}).`;

  quizResult.classList.remove('hidden');
}

async function loadLeaderboard() {
  setView('leaderboardView');
  const rows = await fetchJson('/api/leaderboard');
  renderLeaderboard(rows);
}

function renderLeaderboard(rows) {
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

async function loadAdmin() {
  setView('adminView');
  const data = await fetchJson('/api/admin/attempts');
  renderAdminTables(data);
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

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  const url = isRegister ? '/api/register' : '/api/login';

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

toggleAuthBtn.onclick = () => {
  isRegister = !isRegister;
  authTitle.textContent = isRegister ? 'Create Account' : 'Login';
  authSubmitBtn.textContent = isRegister ? 'Register' : 'Login';
};

logoutBtn.onclick = async () => {
  await fetchJson('/api/logout', { method: 'POST' });

  currentUser = null;
  authCard.classList.remove('hidden');
  appNav.classList.add('hidden');
  homeView.classList.add('hidden');
};

appNav.querySelectorAll('button[data-view]').forEach((btn) => {
  btn.onclick = () => {
    if (btn.dataset.view === 'home') loadQuizSets();
    if (btn.dataset.view === 'leaderboard') loadLeaderboard();
    if (btn.dataset.view === 'admin') loadAdmin();
  };
});

skipQuestionBtn.onclick = () => recordAnswer(null);
restartQuizBtn.onclick = loadQuizSets;
viewLeaderboardBtn.onclick = loadLeaderboard;
resetLeaderboardBtn.onclick = () => alert("Handled in admin panel");

buildQuestionEditor();
identifyUser();
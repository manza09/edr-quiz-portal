const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const db = require('./db');

const app = express();
const port = process.env.PORT || 4000;
const sessionSecret = process.env.SESSION_SECRET || 'quiz-secret-key';
const isProduction = process.env.NODE_ENV === 'production';
const QUESTION_TIMEOUT_SECONDS = 10;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new FileStore({
    path: path.join(__dirname, 'sessions'),
    retries: 1,
    ttl: 24 * 60 * 60
  }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction
  }
}));

function auth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function adminOnly(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password || password.length < 8) {
      return res.status(400).json({ error: 'Username and password are required. Password must be at least 8 characters.' });
    }

    const existing = await db.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already exists.' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const user = await db.createUser(username, passwordHash);
    req.session.user = { id: user.id, username: user.username, role: user.role };
    res.json({ id: user.id, username: user.username, role: user.role });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to register user.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await db.getUserByUsername(username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to regenerate session.' });
      }
      req.session.user = { id: user.id, username: user.username, role: user.role };
      res.json({ id: user.id, username: user.username, role: user.role });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to login.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to destroy session.' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.post('/api/change-password', auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Old and new passwords are required; new password must be at least 8 characters.' });
    }

    const user = await db.getUserById(req.session.user.id);
    if (!user || !bcrypt.compareSync(oldPassword, user.password)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await db.updateUserPassword(user.id, hashedPassword);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

app.get('/api/me', auth, (req, res) => {
  res.json(req.session.user);
});

app.get('/api/quiz-sets', auth, async (req, res) => {
  try {
    const sets = await db.getQuizSets();
    res.json(sets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load quiz sets.' });
  }
});

app.get('/api/quiz/:setId', auth, async (req, res) => {
  try {
    const setId = Number(req.params.setId);
    const set = await db.getQuizSetById(setId);
    if (!set) {
      return res.status(404).json({ error: 'Quiz set not found.' });
    }

    const questions = await db.getQuestionsBySetId(setId);
    req.session.quizState = {
      setId,
      startedAt: Date.now(),
      questionCount: questions.length,
      maxDurationMs: questions.length * QUESTION_TIMEOUT_SECONDS * 1000
    };

    const sanitizedQuestions = questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      option_a: question.option_a,
      option_b: question.option_b,
      option_c: question.option_c,
      option_d: question.option_d
    }));

    res.json({ set, questions: sanitizedQuestions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load quiz.' });
  }
});

app.post('/api/submit-quiz', auth, async (req, res) => {
  try {
    const { setId, answers } = req.body;
    if (!setId || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'Invalid payload.' });
    }

    const state = req.session.quizState;
    if (!state || state.setId !== setId) {
      return res.status(400).json({ error: 'Quiz session not started correctly.' });
    }

    const elapsedMs = Date.now() - state.startedAt;
    if (elapsedMs > state.maxDurationMs) {
      req.session.quizState = null;
      return res.status(400).json({ error: 'Quiz timed out.' });
    }

    const questions = await db.getQuestionsBySetId(setId);
    if (!questions.length) {
      return res.status(400).json({ error: 'Quiz set not found.' });
    }

    const questionMap = Object.fromEntries(questions.map((q) => [q.id, q.answer]));
    let correct_count = 0;
    answers.forEach((item) => {
      const expected = questionMap[item.questionId];
      if (expected && item.answer === expected) correct_count += 1;
    });
    const score = correct_count * 10;

    const attempt = await db.insertQuizAttempt(req.session.user.id, setId, score, correct_count);
    for (const item of answers) {
      const expected = questionMap[item.questionId];
      const correct = expected && item.answer === expected ? 1 : 0;
      await db.insertQuizAnswer(attempt.id, item.questionId, item.answer || null, correct);
    }

    req.session.quizState = null;
    res.json({ score, correct_count, total_questions: questions.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to submit quiz.' });
  }
});

app.get('/api/leaderboard', auth, async (req, res) => {
  try {
    const rows = await db.getLeaderboard();
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load leaderboard.' });
  }
});

app.get('/api/admin/attempts', auth, adminOnly, async (req, res) => {
  try {
    const attempts = await db.getAdminAttempts();
    const details = await db.getAdminAttemptDetails();
    res.json({ attempts, details });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load admin attempts.' });
  }
});

app.get('/api/admin/quiz-sets', auth, adminOnly, async (req, res) => {
  try {
    const sets = await db.getQuizSets();
    res.json(sets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load admin quiz sets.' });
  }
});

app.post('/api/admin/quiz-sets', auth, adminOnly, async (req, res) => {
  try {
    const { title, questions } = req.body;
    if (!title || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Title and questions are required.' });
    }

    const set = await db.insertQuizSet(title);
    for (const question of questions) {
      await db.insertQuestion(set.id, {
        prompt: question.prompt || '',
        option_a: question.option_a || '',
        option_b: question.option_b || '',
        option_c: question.option_c || '',
        option_d: question.option_d || '',
        answer: question.answer || ''
      });
    }

    res.json({ success: true, setId: set.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create quiz set.' });
  }
});

app.post('/api/admin/leaderboard/reset', auth, adminOnly, async (req, res) => {
  try {
    await db.resetLeaderboard();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reset leaderboard.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

db.init()
  .then(() => {
    app.listen(port, () => {
      console.log(`Quiz app running at http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database', err);
    process.exit(1);
  });

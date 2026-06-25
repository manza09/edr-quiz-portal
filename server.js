const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');

let db;
try {
  db = require('./db');
} catch (err) {
  console.error('Failed to load db:', err);
  throw err;
}

const app = express();
const port = process.env.PORT || 4000;

const isProduction = process.env.NODE_ENV === 'production';
const QUESTION_TIMEOUT_SECONDS = 10;

/* ========================
   RENDER FIX
======================== */
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ========================
   SESSION (FIXED FOR RENDER)
======================== */
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'quiz-secret-key',
    resave: false,
    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction, // IMPORTANT for Render HTTPS
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

/* ========================
   AUTH MIDDLEWARE
======================== */
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

/* ========================
   AUTH ROUTES
======================== */
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || password.length < 8) {
      return res.status(400).json({
        error: 'Username and password required (min 8 chars)'
      });
    }

    const existing = await db.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const user = await db.createUser(username, hash);

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    res.json(req.session.user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Register failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await db.getUserByUsername(username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });

      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role
      };

      res.json(req.session.user);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.get('/api/me', auth, (req, res) => {
  res.json(req.session.user);
});

/* ========================
   QUIZ ROUTES
======================== */
app.get('/api/quiz-sets', auth, async (req, res) => {
  try {
    const sets = await db.getQuizSets();
    res.json(sets);
  } catch {
    res.status(500).json({ error: 'Failed to load quiz sets' });
  }
});

app.get('/api/quiz/:setId', auth, async (req, res) => {
  try {
    const setId = Number(req.params.setId);

    const set = await db.getQuizSetById(setId);
    if (!set) return res.status(404).json({ error: 'Not found' });

    const questions = await db.getQuestionsBySetId(setId);

    req.session.quizState = {
      setId,
      startedAt: Date.now(),
      maxDurationMs: questions.length * QUESTION_TIMEOUT_SECONDS * 1000
    };

    res.json({
      set,
      questions: questions.map(q => ({
        id: q.id,
        prompt: q.prompt,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d
      }))
    });
  } catch {
    res.status(500).json({ error: 'Failed to load quiz' });
  }
});

app.post('/api/submit-quiz', auth, async (req, res) => {
  try {
    const { setId, answers } = req.body;

    const state = req.session.quizState;
    if (!state || state.setId !== setId) {
      return res.status(400).json({ error: 'Invalid session' });
    }

    const questions = await db.getQuestionsBySetId(setId);
    const map = Object.fromEntries(questions.map(q => [q.id, q.answer]));

    let correct = 0;
    answers.forEach(a => {
      if (map[a.questionId] === a.answer) correct++;
    });

    const score = correct * 10;

    const attempt = await db.insertQuizAttempt(
      req.session.user.id,
      setId,
      score,
      correct
    );

    for (const a of answers) {
      await db.insertQuizAnswer(
        attempt.id,
        a.questionId,
        a.answer || null,
        map[a.questionId] === a.answer
      );
    }

    req.session.quizState = null;

    res.json({
      score,
      correct_count: correct,
      total_questions: questions.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Submit failed' });
  }
});

/* ========================
   LEADERBOARD
======================== */
app.get('/api/leaderboard', auth, async (req, res) => {
  try {
    const rows = await db.getLeaderboard();
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed leaderboard' });
  }
});

/* ========================
   ADMIN ROUTES
======================== */
app.get('/api/admin/attempts', auth, adminOnly, async (req, res) => {
  try {
    const attempts = await db.getAdminAttempts();
    const details = await db.getAdminAttemptDetails();
    res.json({ attempts, details });
  } catch {
    res.status(500).json({ error: 'Admin load failed' });
  }
});

app.post('/api/admin/quiz-sets', auth, adminOnly, async (req, res) => {
  try {
    const { title, questions } = req.body;

    const set = await db.insertQuizSet(title);

    for (const q of questions) {
      await db.insertQuestion(set.id, q);
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Create failed' });
  }
});

app.post('/api/admin/leaderboard/reset', auth, adminOnly, async (req, res) => {
  try {
    await db.resetLeaderboard();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Reset failed' });
  }
});

/* ========================
   FRONTEND ROUTE
======================== */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ========================
   START SERVER
======================== */
db.init()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch(err => {
    console.error('DB init failed', err);
    process.exit(1);
  });
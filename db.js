const path = require('path');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

const dbFile = path.join(__dirname, 'quiz.db');
const db = new sqlite3.Database(dbFile);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        return reject(err);
      }
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        return reject(err);
      }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows);
    });
  });
}

async function init() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user'
  )`);

  await run(`CREATE TABLE IF NOT EXISTS quiz_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    set_id INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    answer TEXT NOT NULL,
    FOREIGN KEY (set_id) REFERENCES quiz_sets(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    set_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    correct_count INTEGER NOT NULL,
    submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (set_id) REFERENCES quiz_sets(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS quiz_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    selected_option TEXT,
    correct INTEGER NOT NULL,
    FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id),
    FOREIGN KEY (question_id) REFERENCES questions(id)
  )`);

  const adminUser = await get('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!adminUser) {
    const passwordHash = bcrypt.hashSync('admin123', 10);
    await run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['admin', passwordHash, 'admin']);
  }

  const existingSet = await get('SELECT id FROM quiz_sets WHERE title = ?', ['EDR and Hardening Basics']);
  if (!existingSet) {
    const insertSet = await run('INSERT INTO quiz_sets (title) VALUES (?)', ['EDR and Hardening Basics']);
    const setId = insertSet.lastID;

    const questions = [
      {
        prompt: 'What is Endpoint Detection and Response (EDR), and how does it differ from traditional antivirus?',
        option_a: 'EDR only scans files once per month',
        option_b: 'EDR relies only on virus signatures like antivirus',
        option_c: 'EDR provides continuous monitoring and behavioral detection, unlike traditional antivirus',
        option_d: 'EDR only works offline',
        answer: 'C'
      },
      {
        prompt: 'Which detection method in EDR focuses on analyzing unusual program behavior instead of known signatures?',
        option_a: 'Signature-based detection',
        option_b: 'Behavioral analysis',
        option_c: 'Firewall filtering',
        option_d: 'Packet switching',
        answer: 'B'
      },
      {
        prompt: 'What is the role of threat hunting in EDR systems?',
        option_a: 'Automatically deleting all files',
        option_b: 'Proactively searching for hidden or advanced threats',
        option_c: 'Blocking internet access permanently',
        option_d: 'Installing antivirus updates',
        answer: 'B'
      },
      {
        prompt: 'How does EDR integrate into an XDR architecture?',
        option_a: 'It replaces firewalls completely',
        option_b: 'It works independently without sharing data',
        option_c: 'It integrates with other security tools for unified detection and response',
        option_d: 'It disables endpoint monitoring',
        answer: 'C'
      },
      {
        prompt: 'What is the purpose of using CIS Benchmarks or DISA STIGs in OS hardening?',
        option_a: 'To improve gaming performance',
        option_b: 'To standardize secure system configuration practices',
        option_c: 'To install software automatically',
        option_d: 'To increase internet speed',
        answer: 'B'
      },
      {
        prompt: 'Which is an example of account management hardening in Windows or Linux?',
        option_a: 'Installing games for admin users',
        option_b: 'Enabling guest accounts for all users',
        option_c: 'Removing unused accounts and enforcing strong passwords',
        option_d: 'Disabling all security updates',
        answer: 'C'
      },
      {
        prompt: 'What is a common mobile threat vector for Android and iOS devices?',
        option_a: 'Printer malfunction',
        option_b: 'Malicious apps from untrusted sources',
        option_c: 'Keyboard errors',
        option_d: 'Battery overheating only',
        answer: 'B'
      },
      {
        prompt: 'What is the main purpose of Mobile Device Management (MDM)?',
        option_a: 'To increase battery life',
        option_b: 'To manage and enforce security policies on mobile devices',
        option_c: 'To speed up mobile games',
        option_d: 'To replace mobile operating systems',
        answer: 'B'
      },
      {
        prompt: 'What is a key security feature of BYOD programs?',
        option_a: 'Allowing full access to all personal data',
        option_b: 'Removing all encryption',
        option_c: 'Containerization for separating personal and work data',
        option_d: 'Disabling passwords for convenience',
        answer: 'C'
      },
      {
        prompt: 'How does Full Disk Encryption (BitLocker or LUKS) protect data?',
        option_a: 'It deletes unused files automatically',
        option_b: 'It compresses all files for faster access',
        option_c: 'It encrypts all disk data to prevent unauthorized access',
        option_d: 'It only encrypts internet traffic',
        answer: 'C'
      }
    ];

    const insertQuestion = 'INSERT INTO questions (set_id, prompt, option_a, option_b, option_c, option_d, answer) VALUES (?, ?, ?, ?, ?, ?, ?)';
    for (const question of questions) {
      await run(insertQuestion, [setId, question.prompt, question.option_a, question.option_b, question.option_c, question.option_d, question.answer]);
    }
  }
}

async function getUserByUsername(username) {
  return get('SELECT id, username, password, role FROM users WHERE username = ?', [username]);
}

async function getUserById(id) {
  return get('SELECT id, username, role FROM users WHERE id = ?', [id]);
}

async function createUser(username, password, role = 'user') {
  const result = await run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, password, role]);
  return { id: result.lastID, username, role };
}

async function updateUserPassword(id, password) {
  await run('UPDATE users SET password = ? WHERE id = ?', [password, id]);
}

async function getQuizSets() {
  return all('SELECT id, title, created_at FROM quiz_sets ORDER BY id');
}

async function getQuizSetById(id) {
  return get('SELECT id, title, created_at FROM quiz_sets WHERE id = ?', [id]);
}

async function getQuestionsBySetId(setId) {
  return all('SELECT id, prompt, option_a, option_b, option_c, option_d, answer FROM questions WHERE set_id = ? ORDER BY id', [setId]);
}

async function getQuestionById(id) {
  return get('SELECT id, prompt, option_a, option_b, option_c, option_d, answer FROM questions WHERE id = ?', [id]);
}

async function insertQuizSet(title) {
  const result = await run('INSERT INTO quiz_sets (title, created_at) VALUES (?, ?)', [title, new Date().toISOString()]);
  return { id: result.lastID, title, created_at: new Date().toISOString() };
}

async function insertQuestion(setId, question) {
  return run(
    'INSERT INTO questions (set_id, prompt, option_a, option_b, option_c, option_d, answer) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [setId, question.prompt, question.option_a, question.option_b, question.option_c, question.option_d, question.answer]
  );
}

async function insertQuizAttempt(userId, setId, score, correctCount) {
  const result = await run(
    'INSERT INTO quiz_attempts (user_id, set_id, score, correct_count, submitted_at) VALUES (?, ?, ?, ?, ?)',
    [userId, setId, score, correctCount, new Date().toISOString()]
  );
  return { id: result.lastID };
}

async function insertQuizAnswer(attemptId, questionId, selectedOption, correct) {
  await run('INSERT INTO quiz_answers (attempt_id, question_id, selected_option, correct) VALUES (?, ?, ?, ?)', [attemptId, questionId, selectedOption, correct ? 1 : 0]);
}

async function getLeaderboard() {
  return all(
    `SELECT a.id, u.username, s.title AS quiz_title, a.score, a.correct_count, a.submitted_at
       FROM quiz_attempts a
       JOIN users u ON u.id = a.user_id
       JOIN quiz_sets s ON s.id = a.set_id
       ORDER BY a.score DESC, a.submitted_at ASC
       LIMIT 20`,
    []
  );
}

async function getAdminAttempts() {
  return all(
    `SELECT a.id, u.username, s.title AS quiz_title, a.score, a.correct_count, a.submitted_at
       FROM quiz_attempts a
       JOIN users u ON u.id = a.user_id
       JOIN quiz_sets s ON s.id = a.set_id
       ORDER BY a.submitted_at DESC`,
    []
  );
}

async function getAdminAttemptDetails() {
  return all(
    `SELECT qa.attempt_id, q.prompt, qa.selected_option, qa.correct
       FROM quiz_answers qa
       JOIN questions q ON q.id = qa.question_id
       ORDER BY qa.attempt_id, qa.id`,
    []
  );
}

async function resetLeaderboard() {
  await run('DELETE FROM quiz_answers');
  await run('DELETE FROM quiz_attempts');
}

module.exports = {
  init,
  getUserByUsername,
  getUserById,
  createUser,
  updateUserPassword,
  getQuizSets,
  getQuizSetById,
  getQuestionsBySetId,
  getQuestionById,
  insertQuizSet,
  insertQuestion,
  insertQuizAttempt,
  insertQuizAnswer,
  getLeaderboard,
  getAdminAttempts,
  getAdminAttemptDetails,
  resetLeaderboard
};

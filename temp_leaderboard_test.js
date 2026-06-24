const fetch = global.fetch;
const cookieJar = [];
function storeCookies(res) {
  const setCookies = res.headers.get('set-cookie');
  if (!setCookies) return;
  setCookies.split(',').forEach((c) => {
    const cookie = c.split(';')[0];
    const name = cookie.split('=')[0];
    const idx = cookieJar.findIndex((item) => item.startsWith(name + '='));
    if (idx !== -1) cookieJar[idx] = cookie; else cookieJar.push(cookie);
  });
}
function getCookieHeader() { return cookieJar.join('; '); }
(async () => {
  try {
    const login = await fetch('http://localhost:4000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    console.log('login status', login.status);
    console.log('login text', await login.text());
    storeCookies(login);
    const leaderboard = await fetch('http://localhost:4000/api/leaderboard', {
      headers: { Cookie: getCookieHeader() }
    });
    console.log('leaderboard status', leaderboard.status);
    console.log('leaderboard body', await leaderboard.text());
  } catch (err) {
    console.error(err);
  }
})();

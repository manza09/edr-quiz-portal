# EDR Quiz Portal

Simple Node/Express quiz app with SQLite persistence and server-side timing.

## Quick start (local)

1. Install dependencies:

```bash
cd "C:\Users\alman\OneDrive\Desktop\quiz"
npm install
```

2. Start the server:

```bash
npm start
```

3. Open http://localhost:4000

## Prepare repository for GitHub (manual upload)

- Keep `.gitignore` in the project. It should include:

```
node_modules/
quiz.db
sessions/
```

- On GitHub.com: create a new repository and use `Add file -> Upload files` to upload the project folder contents (do not upload `node_modules`, `quiz.db`, or `sessions`).

## Deploy to Render (recommended, free tier)

1. Create an account at https://render.com and connect your GitHub account.
2. Create a new **Web Service** and choose the repository you uploaded.
3. Set the build and start commands:

- Build Command: `npm install`
- Start Command: `npm start`

Render will build and deploy. After deployment you will get a public URL.

## Notes

- This app uses file-based SQLite and session files. On free hosts the filesystem may be ephemeral; expect the DB to reset when the host rebuilds the service.
- For production, consider a managed DB (Postgres) and a session store compatible with the host.


# SETUP INSTRUCTIONS
## Everything you need to do before running ReachInbox Scheduler

---

## Prerequisites — Install these first

| Tool | Version | Download |
|---|---|---|
| Node.js | 20 or higher | https://nodejs.org |
| npm | 10 or higher | comes with Node.js |
| Docker Desktop | latest | https://www.docker.com/products/docker-desktop |
| Git | any | https://git-scm.com |

Verify your installations:
```bash
node --version    # should print v20.x.x or higher
npm --version     # should print 10.x.x or higher
docker --version  # should print Docker version 24.x.x or higher
```

---

## Step 1 — Get Google OAuth Credentials (Required)

This is the only external service you need to sign up for.
Google OAuth is free — no billing required.

1. Go to https://console.cloud.google.com
2. Click **Select a project** at the top → **New Project**
3. Give it any name (e.g. "ReachInbox") → **Create**
4. In the left sidebar go to **APIs & Services** → **Credentials**
5. Click **+ Create Credentials** → **OAuth client ID**
6. If prompted to configure the consent screen first:
   - Choose **External** → **Create**
   - Fill in App name: `ReachInbox`
   - Fill in User support email: your Gmail address
   - Fill in Developer contact email: your Gmail address
   - Click **Save and Continue** through all steps
   - Click **Back to Dashboard**
   - Go back to **Credentials** → **+ Create Credentials** → **OAuth client ID**
7. Application type: **Web application**
8. Name: `ReachInbox Local`
9. Under **Authorised redirect URIs** click **+ Add URI**
10. Enter exactly: `http://localhost:3001/auth/google/callback`
11. Click **Create**
12. A popup shows your **Client ID** and **Client Secret** — copy both somewhere safe

---

## Step 2 — Set Up Your .env File

In the project root folder, copy the example file:

```bash
cp .env.example .env
```

Open `.env` in any text editor and fill in these four values:

```env
# Paste your Google Client ID from Step 1
GOOGLE_CLIENT_ID=your_google_client_id_here

# Paste your Google Client Secret from Step 1
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Type any 32 characters — just make something up
# Example: abcdefghijklmnopqrstuvwxyz123456
ENCRYPTION_KEY=abcdefghijklmnopqrstuvwxyz123456

# Type any 16+ characters — just make something up
# Example: my-local-secret-99
SESSION_SECRET=my-local-secret-99
```

Leave everything else as-is. The defaults work for local development.

---

## Step 3 — Install Dependencies

In the project root folder run:

```bash
npm install
```

This installs packages for both the backend and frontend at once.
It will take 1-2 minutes the first time.

---

## Step 4 — Start Docker Infrastructure

Make sure Docker Desktop is open and running (you should see the Docker icon in your taskbar/menu bar).

Then in the project root run:

```bash
npm run docker:up
```

This starts three containers:
- **PostgreSQL** on port 5432 — the main database
- **Redis** on port 6379 — the job queue and session store
- **Elasticsearch** on port 9200 — the search index

Wait about 30 seconds, then check everything is healthy:

```bash
docker-compose ps
```

All three should show **Up** or **healthy** in the Status column.

If a port is already in use on your machine, stop whatever is using it, or change the port in `docker-compose.yml` and update the matching value in `.env`.

---

## Step 5 — Set Up the Database

Navigate into the backend folder:

```bash
cd apps/backend
```

Run the database migration (creates all tables):

```bash
npx prisma migrate dev
```

When prompted for a migration name, type anything (e.g. `init`) and press Enter.

Then generate the Prisma client:

```bash
npx prisma generate
```

Go back to the project root:

```bash
cd ../..
```

---

## Step 6 — Start the Application

You need three separate terminal windows open in the project root.

**Terminal 1 — API Server:**
```bash
npm run dev:backend
```

Wait until you see:
```
API server listening on port 3001
```

On the very first run it will also print something like:
```
Created new Ethereal test account { user: 'abc123@ethereal.email', pass: 'xxxxxx' }
Add these to your .env to reuse this account across restarts:
  ETHEREAL_USER=abc123@ethereal.email
  ETHEREAL_PASS=xxxxxx
```

**Important:** Copy those ETHEREAL_USER and ETHEREAL_PASS values into your `.env` file right now. This makes sure all sent emails go to the same test inbox across restarts.

---

**Terminal 2 — Worker:**
```bash
npm run dev:worker
```

Wait until you see:
```
Email worker started and ready to process jobs
```

---

**Terminal 3 — Frontend:**
```bash
cd apps/frontend
npm run dev
```

Wait until you see:
```
Local: http://localhost:5173/
```

---

## Step 7 — Open the App

Go to http://localhost:5173 in your browser.

You should see the ReachInbox login page.
Click **Continue with Google** and log in with your Google account.

You will land on the Dashboard.

---

## Step 8 — Add a Sender (Do This First)

Before you can schedule any emails, you need at least one sender.

1. Click **Settings** in the left sidebar
2. Under Senders, click **Add sender**
3. Fill in any email address (e.g. `newsletter@mycompany.com`)
4. Fill in a display name (e.g. `My Newsletter`)
5. Set hourly limit and minimum delay (defaults are fine)
6. Click **Add sender**

---

## Step 9 — Verify Everything Works

**Schedule a test email:**
1. Click **Compose** in the sidebar
2. Select the sender you just created
3. Type a subject and body
4. Set the schedule time to 2 minutes from now
5. Create a text file with one email address per line (e.g. `test@example.com`) and upload it
6. Click **Schedule**

**Check it was queued:**
- Go to http://localhost:3001/admin/queues
- Username: `admin`, Password: `admin_secret` (from your .env)
- You should see a Delayed job counting down

**Check it was sent:**
- After 2 minutes, go to the **Sent** tab in the app
- Click the **View** link to open the Ethereal email preview
- You can also log in at https://ethereal.email with the ETHEREAL_USER and ETHEREAL_PASS from your `.env`

---

## Optional — Slack Integration

Slack notifications are optional. The app works fine without them.

If you want to demonstrate the rate-limit Slack notification:

1. Go to https://api.slack.com/apps → **Create New App** → **From scratch**
2. Name it anything, pick your workspace
3. Go to **OAuth & Permissions** → under Redirect URLs add: `http://localhost:3001/api/slack/callback`
4. Under **Bot Token Scopes** add: `chat:write` and `channels:read`
5. Go to **Basic Information** → copy **Client ID** and **Client Secret**
6. Add to your `.env`:
   ```env
   SLACK_CLIENT_ID=your_slack_client_id
   SLACK_CLIENT_SECRET=your_slack_client_secret
   ```
7. Restart the API server
8. In the app go to **Settings** → click **Connect Slack** → authorise it

---

## Common Problems and Fixes

**"Cannot connect to database"**
Make sure Docker is running and you ran `npm run docker:up`.
Check with `docker-compose ps` — all containers should show healthy.

**"Port 5432 already in use"**
You have another PostgreSQL running locally. Either stop it, or change the port in `docker-compose.yml` from `5432:5432` to `5433:5432` and update `DATABASE_URL` in `.env` to use port 5433.

**"Port 6379 already in use"**
Same issue with Redis. Change `6379:6379` to `6380:6379` and update `REDIS_URL` in `.env`.

**"Google OAuth error: redirect_uri_mismatch"**
The redirect URI in Google Cloud Console doesn't exactly match. Go back to your OAuth credential and make sure it says exactly `http://localhost:3001/auth/google/callback` with no trailing slash.

**"prisma generate failed"**
Make sure you ran `npm install` in the project root first. Then try again from inside `apps/backend`.

**"ENCRYPTION_KEY must be exactly 32 characters"**
Count your ENCRYPTION_KEY value — it must be exactly 32 characters, no more, no less.

**Frontend shows blank page or errors in console**
Make sure the API server (Terminal 1) is running. The frontend proxies API calls to port 3001.

**Worker exits immediately**
Check that Redis is running (`docker-compose ps`). The worker needs Redis to connect to BullMQ.

---

## Quick Reference — All Commands

```bash
# Start infrastructure
npm run docker:up

# Install all packages
npm install

# Database setup (run once, from apps/backend/)
npx prisma migrate dev
npx prisma generate

# Start API server (Terminal 1, from project root)
npm run dev:backend

# Start worker (Terminal 2, from project root)
npm run dev:worker

# Start frontend (Terminal 3, from apps/frontend/)
npm run dev

# Run tests
cd apps/backend && npm test

# Stop Docker containers
npm run docker:down

# View Docker logs
npm run docker:logs

# Open database browser
cd apps/backend && npx prisma studio
```

---

## URLs When Running

| URL | What it is |
|---|---|
| http://localhost:5173 | The React frontend |
| http://localhost:3001/api/health | API health check |
| http://localhost:3001/admin/queues | Bull Board queue dashboard |
| http://localhost:9200 | Elasticsearch (raw) |
| https://ethereal.email | View sent test emails |

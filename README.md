# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

This document reflects the v1.1 state of the application. The application features are now stable. For a complete guide to understanding and replicating this application from scratch, please refer to the detailed instructions in [REPLICATION_PROMPT.md](./REPLICATION_PROMPT.md).

## Sign-in

Each person has their own account: a mobile number and a 4-digit PIN, checked on the
server by `POST /api/auth`. Sign-up is open and lives on the same screen as sign-in.
A right PIN sets an httpOnly session cookie (30 days); `src/middleware.ts` turns away
every page and API route without it, except `/login`, `/signup`, `/api/auth` and the
cache-cleanup cron.

The server needs two things. Without either one, `/api/auth` answers 503 to every
request the sign-in screen makes and nobody can get in, so a production build on Vercel is refused until both
are set (`scripts/check-env.js`).

1. `DATABASE_URL`: a Neon Postgres connection string, where accounts are kept. On
   Vercel: project > Storage > Create Database > Neon, connected to this project, which
   sets the variable for you. The `auth_users` table is created on first use; there is
   no migration to run. `POSTGRES_URL` is read too.
2. `SESSION_SECRET`: any long random string, which signs the session cookie.
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   Changing it signs every device out. An existing `APP_PIN_HASH` is used when this is unset.
3. Optional: set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` so the lockout
   (5 wrong tries, then 15 minutes) is shared across server instances.

Environment variables only reach a deployment built after they were set: redeploy
after adding them.

# Test change for auto-deployment

## App Version Switcher

The application now supports two build targets that can be selected from the **App Version** dropdown in the top navigation bar:

1. **Completely Working Version** – ships with the full feature set and relies on paid/artificial intelligence APIs (speech-to-text, text-to-speech, LLM scoring, etc.).
2. **Free Open Source Version** – removes every paid/proprietary dependency and keeps only the UI + local utilities. Voice agents, call scoring, and any feature that would otherwise call a commercial provider are placed in read-only/demo mode.

Switching versions reloads the UI so that guards take effect immediately. The open-source banner explains which actions are disabled.

### Feature Differences

| Area | Completely Working Version | Free Open Source Version |
|------|---------------------|--------------------------|
| Voice Sales/Support Agents | Interactive calls with live ASR/TTS and scoring | UI available, but calls are disabled with an explanatory notice |
| AI Call Scoring | Upload + transcription + rubric scoring using managed AI endpoints | Disabled – instructions provided to use the paid build |
| Dashboards | Show both native voice-agent logs and backfilled call-scoring entries | Read-only; still render historical data |

### Dependency Instructions

To run the open-source build with only free libraries:

1. Remove packages that wrap paid providers (e.g., OpenAI, AssemblyAI, ElevenLabs, Google Cloud Speech/Text-to-Speech) from `package.json`, then run `npm install`.
2. Delete any paid API keys from `.env.local` (e.g., `OPENAI_API_KEY`, `ASSEMBLYAI_API_KEY`, `ELEVENLABS_API_KEY`).
3. Set the **App Version** dropdown to **Free Open Source Version** so guarded features stay disabled.
4. Run the local OSS services:
   - **Text Generation (Ollama)**
     ```bash
     ollama pull llama2
     OLLAMA_HOST=0.0.0.0:11434 ollama serve
     ```
     Optional env: `OLLAMA_ENDPOINT=http://localhost:11434`, `OLLAMA_MODEL=llama2`.
   - **Text-to-Speech (Coqui TTS)**
     ```bash
     tts-server --model_name tts_models/en/vctk/vits --port 5002
     ```
     Optional env: `COQUI_TTS_ENDPOINT=http://localhost:5002/api/tts`, `COQUI_TTS_SPEAKER=en_US-amy-low`.
   - **Object Storage (MinIO)** if you need S3-compatible uploads.

Re-enabling the commercial build simply requires reinstalling those dependencies, restoring the environment variables, and switching back to **Completely Working Version** in the dropdown.

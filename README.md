# FTC Nexus Dashboard

A comprehensive club management platform for FIRST Tech Challenge (FTC) teams, featuring real-time attendance tracking, task management, budget oversight, and AI-powered insights.

## Features

- **Dashboard**: Live club health metrics, attendance trends, and activity summaries
- **Teams & Members**: Manage team rosters with role-based permissions and scopes
- **Attendance**: Grid-based attendance tracking with AI-powered analysis
- **Tasks**: Kanban board for task management with completion analytics
- **Budget**: Income and expense tracking with financial summaries
- **Outreach**: Log community service hours and events
- **Communications**: Track emails and announcements
- **Messaging**: In-app chat with mention notifications
- **AI Scout**: Real-time FTC news and updates powered by local LLM
- **WebSocket**: Live updates across all connected clients

## Tech Stack

- **Frontend**: React + TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Express.js with SQLite database
- **AI**: node-llama-cpp with local GGUF models (e.g., Phi-3.5)
- **Real-time**: WebSocket for live notifications and chat

## Prerequisites

- Node.js 18+
- SQLite3 (included with better-sqlite3)
- A GGUF model file (Phi-3.5 recommended, ~3GB)

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Place your model:**
   - Add a `.gguf` model file to the `models/` directory, or
   - Set `LLAMA_MODEL_PATH` in `.env` to point to your model location

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```
LLAMA_MODEL_PATH=./models/Phi-3.5-mini-instruct-Q5_K_M.gguf
MAX_TOKENS_LIMIT=1024
DISABLE_NEWS=0
OLLAMA_URL=http://localhost:11434/api/generate
OLLAMA_MODEL=phi3.5
EXA_API_KEY=your_exa_api_key_here
```

- `MAX_TOKENS_LIMIT`: Maximum tokens for AI responses (default: 1024)
- `DISABLE_NEWS`: Set to `1` to disable the news endpoint temporarily
- `OLLAMA_*`: For Ollama backend integration (optional)
- `EXA_API_KEY`: For web search integration (optional)

## API Endpoints

### AI Endpoints

- `POST /api/ai/fetch-news` - Get FTC/robotics news (supports `?stream=true`)
- `POST /api/ai/attendance` - Analyze attendance patterns
- `POST /api/ai/check-excuse` - Evaluate absence reasons
- `POST /api/ai/activity-summary` - Generate club activity summaries

### Data Endpoints

- `GET/POST /api/teams`, `/api/members`, `/api/attendance`, `/api/tasks`, `/api/budget`, `/api/outreach`, `/api/communications`
- `POST /api/auth/login`, `/api/auth/setup`, `/api/auth/reset`

## Model Performance

The app uses CPU-only inference by default to avoid GPU allocation errors. For optimal performance:
- Use quantized models (Q4_K_M, Q5_K_M) to reduce memory footprint
- Phi-3.5 mini (~3-4GB) provides good balance of speed and quality
- Response generation typically takes 30-60 seconds depending on model size and hardware

## Database

SQLite database (`nexus.db`) stores:
- Teams and members with role-based permissions
- Attendance records with excused/unexcused tracking
- Tasks with status tracking and assignments
- Budget transactions categorized by team
- Outreach events and hours logged
- Messages and notifications with real-time WebSocket sync

## Development

- **Build for production:** `npm run build`
- **Preview production build:** `npm run preview`
- Hot Module Replacement enabled for instant feedback

## License

Proprietary - FTC Team Dashboard


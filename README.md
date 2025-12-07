# BPMN Colab

A collaborative BPMN (Business Process Model and Notation) editor.

## Tech Stack

**Frontend:** React + TypeScript + Vite + bpmn-js  
**Backend:** Python + FastAPI + WebSockets

## Prerequisites

- **Node.js** npm package manager
- **Python** 3.12 or higher
- **uv** python package manager

## Quick Start

### Backend Setup

1. Navigate to the backend directory:

   ```bash
   cd backend
   ```

2. Install dependencies (uv will automatically create a virtual environment):

   ```bash
   uv sync
   ```

3. Run the FastAPI server:
   ```bash
   uv run main.py
   ```

The backend will start on `http://localhost:8001`

### Frontend Setup

1. Navigate to the frontend directory:

   ```bash
   cd frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

The frontend will start on `http://localhost:5173` (or another port if 5173 is busy)

## Project Structure

```
bpmn-colab/
├── backend/
│   ├── main.py           # FastAPI application with WebSocket support
│   └── pyproject.toml    # Python dependencies
└── frontend/
    ├── src/
    │   ├── App.tsx       # Main React component
    │   └── ...
    └── package.json      # Node.js dependencies
```
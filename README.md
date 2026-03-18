# TradeAnalyzer

AI-powered Chrome extension plus Node.js backend for visual page analysis. The extension captures the current tab, extracts visible DOM context, sends both to a backend, and renders structured AI results in a Chrome side panel.

## Features

- Chrome Extension MV3 with Side Panel UI
- Visible-tab screenshot capture via `chrome.tabs.captureVisibleTab`
- DOM extraction for title, URL, headings, visible text, links, and selected text
- Context transparency panel with screenshot and extracted text preview
- Mode-aware analysis (`auto`, `page`, `chart`, `ui`)
- TradingView detection with chart-focused prompt rules
- Node.js + Express backend with Gemini (Google Gen AI) integration
- Structured output: summary, observations, warnings, next actions

## Project Structure

```text
extension/
  manifest.json
  background/service-worker.ts
  content/extractor.ts
  sidepanel/
    sidepanel.html
    sidepanel.ts
    sidepanel.css
backend/
  src/
    server.ts
    routes/analyze.ts
    services/
      aiClient.ts
      promptBuilder.ts
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure backend environment

Create `backend/.env`:

```bash
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-3.1-pro-preview
PORT=8787
```

`GEMINI_MODEL` is optional. The backend defaults to `gemini-3.1-pro-preview`.

### 3. Build the project

```bash
npm run build
```

This outputs:

- extension build artifacts in `extension/dist`
- backend build artifacts in `backend/dist`

### 4. Run the backend

```bash
npm run dev -w backend
```

Or after build:

```bash
node backend/dist/server.js
```

### 5. Load the Chrome extension

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click `Load unpacked`
4. Select `/Users/mikepenzin/Documents/Projects/Trend Analyzer/extension`

The extension points to `http://localhost:8787` by default. You can change the API URL in the side panel settings area or by editing `extension/background/service-worker.ts`.

## How It Works

1. The side panel requests analysis for the active tab.
2. The service worker asks the content script to extract page context.
3. The service worker captures the visible tab screenshot.
4. The side panel sends the payload to `POST /analyze`.
5. The backend builds a mode-aware prompt and calls the Gemini (Google Gen AI) API.
6. The side panel renders the structured result and saves it to local history.

## API

### `POST /analyze`

Request body:

```json
{
  "mode": "page",
  "userPrompt": "Summarize the key risks on this page.",
  "screenshot": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "pageContext": {
    "title": "Example Page",
    "url": "https://example.com/article",
    "headings": ["Markets Overview"],
    "visibleText": ["Stocks rallied after the report..."],
    "links": [
      {
        "text": "Read more",
        "href": "https://example.com/read-more"
      }
    ],
    "selectedText": "",
    "metadata": {
      "detectedMode": "page",
      "isTradingView": false
    }
  }
}
```

Response body:

```json
{
  "summary": "The page provides a market recap focused on earnings-driven momentum.",
  "observations": [
    "The headline and visible text emphasize short-term market movement.",
    "The page includes supporting links for deeper reading."
  ],
  "warnings": [
    "This analysis is limited to visible page content and the screenshot.",
    "No hidden or collapsed content was analyzed."
  ],
  "nextActions": [
    "Open the linked supporting article for more detailed context.",
    "Ask a follow-up question about specific risks or assumptions."
  ],
  "meta": {
    "modeUsed": "page"
  }
}
```

## Notes

- `Compare Tabs` is included as a UI stub for the MVP.
- The current build focuses on visible-page analysis, not link traversal or region selection yet.
- TradingView analysis is intentionally cautious and warns about lack of raw chart data.


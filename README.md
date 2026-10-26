# Kit

Answers with evidence. A local RAG starter built with Node.js 22+, a browser interface, and optional OpenAI APIs. No npm dependencies or database service required.

## Start

Open PowerShell in this folder and run:

```powershell
npm.cmd start
```

Open http://127.0.0.1:3210. Click **Try a sample document**, then **Ask Kit**. Without a key, Kit performs local keyword retrieval and displays exact excerpts. This demo does not generate AI answers.

## Enable real RAG

```powershell
Copy-Item .env.example .env
notepad .env
```

Set `OPENAI_API_KEY` to your API key locally; never paste it into chat or commit it. Restart the server. `OPENAI_MODEL` and `EMBEDDING_MODEL` are configurable; the defaults are `gpt-6-astra` and `text-embedding-3-small`. Your API account must have access to the selected model and API billing enabled.

With a key configured, uploaded document text is sent to OpenAI to create embeddings. Questions are embedded, the best passages are retrieved, and those passages plus the question are sent to the Responses API for a cited answer. Existing demo documents are embedded on the first AI query. API calls can incur charges. The browser never receives your API key. `store: false` is sent for generation; this is not a promise of zero provider retention.

## Architecture

```text
TXT / Markdown → overlapping passages → embeddings → local JSON vector index
Question → embedding → cosine + keyword ranking → top 4 passages
         → OpenAI Responses API → answer with [1] citations → source excerpts
```

- `server.mjs`: loopback-only HTTP server, ingestion, persistence, validation, API calls.
- `rag.mjs`: chunking, cosine search, keyword retrieval, embeddings and generation.
- `public/`: browser UI, library management and clickable citations.
- `data/documents.json`: local persistent documents and vectors, excluded from Git.
- `test/`: offline integration and mocked provider tests.

The starter uses exact cosine search over a JSON vector index, suitable for a small library. It is deliberately simple enough to inspect and replace with a dedicated vector database later. Limits: 50 documents, 100,000 characters each; UTF-8 `.txt` and `.md` only. PDF parsing is not implemented.

## Verify

```powershell
npm.cmd test
```

Tests cover chunk coverage, semantic matching, citation identifiers, input validation, cross-origin rejection, upload/search/delete, persistence, and the AI request path using a mocked provider. These automated tests mock OpenAI. A separate live smoke test verified embeddings, answer generation, and a matching source citation with a configured API key.

## What to build next

1. Create an evaluation set with 20 questions, expected source passages, and questions the documents cannot answer. Measure retrieval recall and whether cited passages actually support answers.
2. Add PDF extraction with page-number citations.
3. Add a reranker and calibrate the retrieval threshold against your evaluation set.
4. Replace the JSON index with a vector database when the library grows.
5. Add user authentication and per-user document access before hosting it publicly.

Citations are checked for valid identifiers, but their factual support is not automatically verified. Retrieval thresholds are starter heuristics. Each question is independent; there is no conversational memory. The local store is plaintext and this app is intended for a single running process. This folder is under OneDrive, so local document data may also sync according to your OneDrive settings.

API references: [Embeddings](https://developers.openai.com/api/docs/guides/embeddings), [Responses quickstart](https://developers.openai.com/api/docs/quickstart).

## Interface and motion

An original red, blue, and green evidence-card layout with independent floating cards, slow orbit motion, and drifting ambient background light. Animations respect the operating system reduced-motion preference. No external UI dependencies.


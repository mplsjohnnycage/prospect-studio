# Item 22 design note: desktop embeddings + lookalike-to-winners (not built)
Status: design only. Nothing here runs yet. Zero spend: local model on DESKTOP-3APDBKG, no paid APIs.

## Goal
Score each promoted prospect by similarity to past winners (paid or replied), and add that score to the gates. The hand-tuned weights stay until roughly 200 to 300 sends have outcome labels.

## Pieces
1. **Model**: an EmbeddingGemma-class open model (about 300M params) via Ollama or transformers.js on the desktop. CPU is enough at our volume (tens per day).
2. **Text to embed**: trade + city + segment + Brand DNA themes and tone + site-health issues + trigger type. No personal data; public business facts only.
3. **New agent task kind `embed`** (desktop-only, same lease protocol): the worker embeds and posts `{prospectId, vector, model, dim}` to `POST /agent/embed` (Bearer secret).
4. **Convex storage**: a new table `prospectVectors {ownerId, prospectId, model, vector: v.array(v.float64())}` with a `vectorIndex` (dimensions = model dim, filterFields `ownerId`). Additive schema change, so it needs Johnny's approval per the schema rule.
5. **Lookalike**: `ctx.vectorSearch` over winners' vectors (outcome `paid`/`replied`), mean of the top-k cosine similarities, scaled 0 to 100. This replaces today's gate-vector lookalike in `promoteFor` when a vector exists; otherwise the current gate-based lookalike stays as the fallback.
6. **Classifier**: weekly `learn` already re-weights gates with calibrateWeights. Add a logistic regression on [gates, lookalike] once there are 200+ labels, run on the desktop, and post the proposed weights to the weekly digest only. Johnny approves any weight change.

## Guardrails
- Model version is stored with each vector; a model change re-embeds lazily.
- Caps: embed at most 200 per day; desktop only. The Sprite fallback does not embed.
- Evals: before lookalike affects ranking, there's a holdout check: AUC > 0.6 on past labels, otherwise it stays display-only.

## Open questions for Johnny
- Approve the `prospectVectors` table (schema change).
- Ollama or transformers.js on the desktop (install is his step).

# AGENTS.md — LLM Context Calculator

Development reference for this repo. Describes the current implementation;
keep it in sync with the code.

## What it is

Offline web app that estimates the maximum context window for `llama.cpp`
running a local model on a consumer GPU. Vanilla HTML/CSS/JS, zero
dependencies, works from `file://`. The user imports a model from Hugging
Face (a GGUF repo); the app fetches architectural specs and GGUF file
sizes, then computes weight VRAM, KV cache bytes per token, max context,
and decode speed.

## Files

```
index.html   # layout + markup
app.js       # all logic (classic IIFE script, not a module → works over file://)
styles.css   # dark theme
```

## Inputs

- **Hardware**: GPU dropdown (`GPU_LIST`) auto-fills Total VRAM (GB) and
  Bandwidth (GB/s); both remain manually editable. Default: RTX 5080
  (16 GB, 960 GB/s). Supports NVIDIA RTX, AMD RX, Intel Arc, and Apple
  Silicon Macs (M1–M4). On Apple Macs, "Total VRAM" is the unified
  system memory (total RAM), since CPU and GPU share memory. The dropdown
  is a custom `<div>`-based component (not a native `<select>`) with
  full-width CSS category separators (NVIDIA, AMD, Intel, Apple).
- **Overheads**:
  - Model runtime (GB) — auto-estimated on import/selection via
    `estimateRuntimeOverhead`: ≤4B → 0.6, ≤9B → 0.85, ≤15B → 1.1, ≤27B → 1.3, ≤40B → 1.4,
    >40B → 1.75. Manually overridable.
  - Desktop / other apps (GB) — manual, default 0.
- **HF Import**: model repo search (`/api/models?search=`), specs
  (`/api/models/{id}`), GGUF file list (`/api/models/{id}/tree/main`).
  Optional access token for gated models.

## HF import flow (`fetchGgufVariants`)

1. `searchGgufRepos(baseName)`: score candidates by closeness to the base
   name (exact = 0, prefix, substring, no-match = 999); take the best.
2. `fetchModelSpecs`: read the repo `config` (layers, KV heads, head dim).
   If missing, fall back to `KNOWN_ARCHS` (family regex → closest model
   within 25% of the estimated params).
3. `fetchQuants`: list `.gguf` files from the tree endpoint (skip
   `imatrix*`). Parse quant tags; MTP files
   (`<base>-<quant>-mtp.gguf`) are separate models — each gets its own row
   labeled `{{quant}} (MTP)`, where quant is the second-to-last dash
   segment, uppercased.
4. Params: `parseParamsFromName` ("27B" → 27), else `estimateParams`
   (largest non-MTP file size, assuming ~8 bits/weight).
5. Auto-fill the runtime overhead, auto-select the largest quant that fits
   in the available VRAM (`selectBestWeightQuant`), then `compute()`.

## Calculations

```
weightsGB      = size of the selected GGUF file (from the tree endpoint)
mtpGB          = MTP file size − base-quant size (0 for non-MTP quants)
remainingGB    = totalVRAM − weightsGB − mtpGB − runtime − desktop
kvBase         = 2 × kvLayers × kvHeads × headDim            # bytes/token (K + V)
kvPerToken     = kvBase × bytesPerElem            # symmetric mode (K = V)
               = (kvBase / 2) × (kBytes + vBytes)  # asymmetric mode (K ≠ V)
mtpKvBase      = 2 × 1 × kvHeads × headDim             # MTP draft: 1 layer
mtpKvPerToken  = mtpKvBase × mtpBytesPerElem            # symmetric mode (K = V)
               = (mtpKvBase / 2) × (mtpKBytes + mtpVBytes)  # asymmetric mode
totalKvPerToken = kvPerToken + mtpKvPerToken
maxContext     = floor(remainingGB × 1e9 / totalKvPerToken)
```

`KV_CACHE_TYPES` (bytes per element, llama.cpp `--cache-type-k` /
`--cache-type-v`): f32 = 4.0, f16 = 2.0, q8_0 = 1.03125, q5_1 = 0.6875,
q5_0 = 0.65625, q4_1 = 0.5625, q4_0 = 0.53125.

Decode speed: `tok/s ≈ τ × bandwidth × 1e9 / (weightBytes + totalKvPerToken)`,
where τ = 2 with MTP (K=3 draft, typical acceptance ≈ 0.6), τ = 1 without.

## KV cache types card

One card, titled "KV cache types", or "Main / Draft KV cache types" when
an MTP variant is selected. It holds the main "Cache sizes" buttons
(`#kvCheckSizes`) and the asymmetric toggle (`#asymToggle`); when an MTP
variant is selected it also shows a "Draft cache sizes" button row
(`#mtpKvCheckSizes`) and a draft asymmetric toggle (`#mtpAsymToggle`).

The chart area (`#kvChart`) renders one of two views:

- **Non-MTP**: a bar chart. Symmetric mode: one bar per KV type (same
  type for K & V). Asymmetric mode: one bar per (K, V) pair of checked
  types; mirror pairs de-duplicated (keep kBytes ≥ vBytes). Bar width ∝
  max context tokens, sorted ascending; value = token count.
- **MTP**: a spreadsheet — rows = main types, columns = draft types. Each
  cell = floor(remainingGB × 1e9 / (mainPerTok + draftPerTok)) for that
  (main, draft) pair; the draft side uses 1 layer
  (`mtpKvBase = 2 × 1 × kvHeads × headDim`). Cell background is a
  red→yellow→green gradient keyed to the visible cells' min/median/max
  (red = lowest, yellow = median, green = highest), dimmed by blending in
  the card's gray background (`--surface-2`). The selected cell is
  outlined in `--accent`, and its row + column are lightly outlined
  (inset shadow) to form a cross/plus highlight.

- `KV_FAMILY_COLORS`: flat color per family prefix (F32, F16, Q8, Q5, Q4),
  used on the bar labels and the spreadsheet row/column headers.
- Clicking a bar (non-MTP) or a spreadsheet cell (MTP) selects that
  type/pair — and the draft type/pair when MTP — then recomputes, so the
  VRAM allocation card updates accordingly.

## VRAM allocation bar

Six segments in order: desktop (red `--bad`), runtime (green `--good`),
weights (blue `--accent`), KV cache (yellow `--warn`), MTP head (purple
`--mtp`), MTP KV cache (light purple `--mtp-kv`). The MTP head and MTP KV
cache segments (and their legend items) are hidden when a non-MTP variant
is selected. Segment width = segmentGB / totalVRAM × 100%; in the overfull
case the 5 used segments scale to fill 100% (no KV). The MTP KV cache
segment value is token-count-based: `maxContext × mtpKvPerToken / 1e9`
(the MTP draft cache holds the same token count as the main KV cache, N main
layers + 1 MTP layer). Each segment stores
`data-name` / `data-gb` / `data-pct` for the shared speech-bubble
tooltip (`#speechTip`, zero show delay, 300 ms linger).

## Shareable link

A "Copy share link" button at the top of the VRAM allocation card serializes
the current inputs into a `?s=<base64url-encoded JSON>` query param and copies
it to the clipboard. The JSON carries `gpu, vram, bw, rt, dsk, hf, q, kv,
asym, k, v, mtpkv, mtpasym, mtapk, mtpv` (the HF repo id, weight quant,
main KV type, asymmetric K/V types, and MTP draft KV type / asymmetric K/V
types). The access token is never included in the link.

On page load, `restoreFromUrl()` parses `?s=` and:
- applies the numeric fields (GPU / VRAM / bandwidth / runtime / desktop);
- if `hf` is present, sets the HF field and auto-triggers the import
  (`fetchGgufVariants`), re-applying the shared `q` / `rt` / KV / MTP-KV
  selection after the import's own defaults;
- otherwise applies the KV + MTP-KV selection and computes.

If the
import can't run (offline / gated), the hardware + overheads still restore and
the normal import error shows.

## Edge cases

- No imported model → "Import a model to get started."
- `totalVRAM ≤ 0` → all bar segments 0%.
- `remainingGB ≤ 0` → "Model does not fit"; used segments scaled to 100%,
  no KV / free.
- `maxContext ≤ 0` → "Not enough VRAM for even one token of context."
- Missing architecture specs → warning, results cleared.

## Conventions

- `app.js` is a classic IIFE script — no ES modules (they break over
  `file://`).
- `formatDecimal` on blur ensures ≥ 1 decimal place for the vram /
  runtime / desktop fields.
- Help circles (`#helpVram`, `#helpDesktop`, `#helpRuntime`) show
  platform-aware commands in the shared speech bubble: `nvidia-smi` for
  NVIDIA/AMD/Intel, `system_profiler` / `top` for Apple Silicon. With a 📋
  copy-to-clipboard button (Clipboard API with `execCommand` fallback for
  `file://`).
- `KNOWN_ARCHS` families: qwen3, qwen2.5, llama, mistral, gemma, phi,
  command, gpt-oss.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

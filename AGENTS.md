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

- **Hardware**: GPU `<select>` (`GPU_LIST`) auto-fills Total VRAM (GB) and
  Bandwidth (GB/s); both remain manually editable. Default: RTX 5080
  (16 GB, 960 GB/s).
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
weightsGB   = size of the selected GGUF file (from the tree endpoint)
mtpGB       = MTP file size − base-quant size (0 for non-MTP quants)
remainingGB = totalVRAM − weightsGB − mtpGB − runtime − desktop
kvBase      = 2 × kvLayers × kvHeads × headDim            # bytes/token (K + V)
kvPerToken  = kvBase × bytesPerElem            # symmetric mode (K = V)
            = (kvBase / 2) × (kBytes + vBytes)  # asymmetric mode (K ≠ V)
maxContext  = floor(remainingGB × 1e9 / kvPerToken)
```

`KV_CACHE_TYPES` (bytes per element, llama.cpp `--cache-type-k` /
`--cache-type-v`): f32 = 4.0, f16 = 2.0, q8_0 = 1.025, q5_1 = 0.673,
q5_0 = 0.649, q4_1 = 0.548, q4_0 = 0.524.

Decode speed: `tok/s ≈ τ × bandwidth × 1e9 / (weightBytes + kvPerToken)`,
where τ = 2 with MTP (K=3 draft, typical acceptance ≈ 0.6), τ = 1 without.

## KV cache types chart

- Symmetric mode: one bar per KV type (same type for K & V).
- Asymmetric mode (`#asymToggle`): one bar per (K, V) pair of checked
  types; mirror pairs de-duplicated (keep kBytes ≥ vBytes).
- Bar width ∝ max context tokens, sorted ascending; value = token count.
- `KV_FAMILY_COLORS`: flat color per family prefix (F32, F16, Q8, Q5, Q4).
- Clicking a bar selects that type/pair and recomputes.

## VRAM allocation bar

Six segments in order: desktop (red `--bad`), runtime (green `--good`),
weights (blue `--accent`), MTP head (purple `--mtp`), KV cache (yellow
`--warn`), free (gray `--muted`). Segment width = segmentGB / totalVRAM ×
100%; in the overfull case the 4 used segments scale to fill 100% (no KV /
free). Each segment stores `data-name` / `data-gb` / `data-pct` for the
shared speech-bubble tooltip (`#speechTip`, zero show delay, 300 ms
linger).

## Slider

Range `0 → maxContext`, resting at max context (0 headroom). Live readout:
context tokens, headroom GB, ≈ words (×0.75). The KV cache + free segments
track the slider value.

## Shareable link

A "Copy share link" button at the top of the VRAM allocation card serializes
the current inputs into a `?s=<base64url-encoded JSON>` query param and copies
it to the clipboard. The JSON carries `gpu, vram, bw, rt, dsk, hf, q, kv,
asym, k, v` (the HF repo id, weight quant, KV type, and asymmetric K/V types).
The access token is never included in the link.

On page load, `restoreFromUrl()` parses `?s=` and:
- applies the numeric fields (GPU / VRAM / bandwidth / runtime / desktop);
- if `hf` is present, sets the HF field and auto-triggers the import
  (`fetchGgufVariants`), re-applying the shared `q` / `rt` / KV selection after
  the import's own defaults;
- otherwise applies the KV selection and computes.

The slider always rests at max context (no slider position is shared). If the
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
  `nvidia-smi` commands in the shared speech bubble, with a 📋
  copy-to-clipboard button (Clipboard API with `execCommand` fallback for
  `file://`).
- `KNOWN_ARCHS` families: qwen3, qwen2.5, llama, mistral, gemma, phi,
  command, gpt-oss.

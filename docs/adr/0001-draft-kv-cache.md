# ADR-0001: Draft KV cache as a first-class concept

## Status

Accepted.

## Context

The app estimates the maximum context window for a local LLM on a consumer
GPU. MTP (multi-token-prediction) variants are separate models that draft
extra tokens; their head carries its own VRAM and its own KV cache (1 layer,
vs the main model's layer count). Before this decision, the **draft KV cache**
was a secondary concern: a separate card, a separate bar chart, and a
separate KV type selection. The main and draft KV caches were modeled as two
independent charts, which made the UI heavier and split the mental model.

## Decision

Treat the draft KV cache as a first-class concept alongside the main KV cache,
and merge the two KV cache cards into a single card:

- **One card**, titled "KV cache types", or "Main / Draft KV cache types"
  when an MTP variant is selected. The model name is not in the title.
- **Draft parameter line** ("Draft cache sizes" buttons + "Draft asymmetric
  K/V cache sizes" toggle) is shown only when an MTP variant is selected;
  hidden otherwise.
- **Spreadsheet view** (MTP): rows = main KV types, columns = draft KV types;
  each cell = `floor(remainingGB × 1e9 / (mainPerTok + draftPerTok))`. The
  draft side uses 1 layer (`mtpKvBase = 2 × 1 × kvHeads × headDim`).
- **Non-MTP view**: the original bar chart (one bar per KV type, or per
  (K, V) pair in asymmetric mode).
- **Cell coloring**: a red→yellow→green gradient keyed to the visible
  cells' min/median/max (red = lowest, yellow = median, green = highest),
  dimmed by blending in the card's gray background (`--surface-2`). The
  selected cell is outlined in `--accent`, and its row + column are lightly
  outlined (inset shadow) to form a cross/plus highlight.
- **Clicking** a bar (non-MTP) or a spreadsheet cell (MTP) selects that
  type/pair — and the draft type/pair when MTP — then recomputes, so the
  VRAM allocation card updates accordingly.

## Calculations

The draft KV cache adds to the per-token cost:

```
mtpKvBase      = 2 × 1 × kvHeads × headDim   # draft: 1 layer
mtpKvPerToken  = mtpKvBase × mtpBytesPerElem            # symmetric (K = V)
               = (mtpKvBase / 2) × (mtpKBytes + mtpVBytes)  # asymmetric
totalKvPerToken = kvPerToken + mtpKvPerToken
maxContext     = floor(remainingGB × 1e9 / totalKvPerToken)
```

The MTP KV cache segment in the VRAM allocation bar is token-count-based:
`maxContext × mtpKvPerToken / 1e9` (the draft cache holds the same token
count as the main KV cache, N main layers + 1 MTP layer).

## Consequences

- **Positive**: the UI is lighter (one card, one chart area); the mental
  model is unified (main + draft are one spreadsheet); the gradient and
  cross/plus highlight make the (main, draft) trade-offs visible at a glance.
- **Negative**: the spreadsheet is denser than two bar charts; the cell
  coloring and cross/plus highlight add CSS complexity (the `hidden`
  attribute vs `display` specificity gotcha required a scoped
  `[hidden] { display: none; }` rule — see `CODING_STANDARDS.md`).

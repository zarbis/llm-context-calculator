# LLM Context Calculator

Offline estimator of the maximum context window for a local LLM on a consumer GPU, given the model's weights, runtime overhead, and KV-cache cost.

## Language

### Model

**model weights**:
The VRAM occupied by the selected quantized model file.
_Avoid_: weight VRAM, weights

**runtime overhead**:
The VRAM the model's runtime consumes beyond the model weights.
_Avoid_: Model runtime, runtime

**quant**:
The quantization tag of a model file (e.g. Q4_0, Q8_0).

**GGUF**:
The file format of a quantized model repository.

**MTP**:
A multi-token-prediction model that drafts extra tokens, carried as its own VRAM.

### Context

**KV cache**:
The per-token memory the attention keys and values require.

**KV cache type**:
The quantization applied to KV entries, in symmetric mode (K and V share a type) or asymmetric mode (K and V differ).

**MTP draft KV cache**:
The separate KV cache of the MTP draft model/head, using 1 layer (vs the main model's layer count). Has its own independent KV cache type selection with full symmetric/asymmetric parity.

**max context**:
The ceiling on context tokens for the available VRAM, accounting for both the main and MTP draft KV caches.

**context**:
The current context-token count, always at most max context.

**decode speed**:
The estimated tokens per second for generation.

### Import

**HF import**:
Importing a model from a Hugging Face GGUF repository.

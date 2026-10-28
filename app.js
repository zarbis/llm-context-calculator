(function () {
  'use strict';

  // ─── Data tables ────────────────────────────────────────────────────────────
  // Flat color palette: one distinct flat color per KV variant family
  // (the prefix before "_" in the variant id). Only families present in
  // KV_CACHE_TYPES are included. Ordered by quality:
  // full precision → most aggressive quantization.
  const KV_FAMILY_COLORS = {
    F32:  '#6e7681', // gray
    F16:  '#3fb950', // green
    Q8:   '#4d8dff', // blue
    Q5:   '#f0c848', // yellow
    Q4:   '#f85149', // red
  };

  // llama.cpp KV cache types (--cache-type-k / --cache-type-v), with bytes per element.
  // bytesPerElem is the number of bytes per element in the KV cache storage.
  // Sorted descending by bytesPerElem (largest/full-precision first).
  const KV_CACHE_TYPES = [
    { id: 'f32',    label: 'f32',    bytesPerElem: 4.0 },
    { id: 'f16',    label: 'f16',    bytesPerElem: 2.0 },
    { id: 'q8_0',   label: 'q8_0',   bytesPerElem: 1.03125 },
    { id: 'q5_1',   label: 'q5_1',   bytesPerElem: 0.6875  },
    { id: 'q5_0',   label: 'q5_0',   bytesPerElem: 0.65625 },
    { id: 'q4_1',   label: 'q4_1',   bytesPerElem: 0.5625  },
    { id: 'q4_0',   label: 'q4_0',   bytesPerElem: 0.53125 },
  ];

  const GPU_LIST = [
    { name: 'RTX 5090',      vram: 32, bandwidth: 1792,  cat: 'NVIDIA' },
    { name: 'RTX 5080',      vram: 16, bandwidth: 960,   cat: 'NVIDIA' },
    { name: 'RTX 5070 Ti',   vram: 16, bandwidth: 896,   cat: 'NVIDIA' },
    { name: 'RTX 5070',      vram: 12, bandwidth: 672,   cat: 'NVIDIA' },
    { name: 'RTX 5060 Ti',   vram: 16, bandwidth: 896,   cat: 'NVIDIA' },
    { name: 'RTX 5060 Ti 8G',vram: 8,  bandwidth: 576,   cat: 'NVIDIA' },
    { name: 'RTX 4090',      vram: 24, bandwidth: 1008,  cat: 'NVIDIA' },
    { name: 'RTX 4080',      vram: 16, bandwidth: 716.8, cat: 'NVIDIA' },
    { name: 'RTX 4070 Ti',   vram: 16, bandwidth: 548,   cat: 'NVIDIA' },
    { name: 'RTX 4070',      vram: 12, bandwidth: 448,   cat: 'NVIDIA' },
    { name: 'RTX 4060 Ti',   vram: 16, bandwidth: 288,   cat: 'NVIDIA' },
    { name: 'RTX 4060',      vram: 8,  bandwidth: 272,   cat: 'NVIDIA' },
    { name: 'RTX 3090',      vram: 24, bandwidth: 936,   cat: 'NVIDIA' },
    { name: 'RTX 3080 Ti',   vram: 12, bandwidth: 912,   cat: 'NVIDIA' },
    { name: 'RTX 3080',      vram: 10, bandwidth: 912,   cat: 'NVIDIA' },
    { name: 'RTX 3070 Ti',   vram: 8,  bandwidth: 760,   cat: 'NVIDIA' },
    { name: 'RTX 3070',      vram: 8,  bandwidth: 760,   cat: 'NVIDIA' },
    { name: 'RTX 3060',      vram: 12, bandwidth: 360,   cat: 'NVIDIA' },
    { name: 'RTX 2080 Ti',   vram: 11, bandwidth: 448,   cat: 'NVIDIA' },
    { name: 'RTX 2080',      vram: 11, bandwidth: 448,   cat: 'NVIDIA' },
    { name: 'RTX 2070',      vram: 8,  bandwidth: 448,   cat: 'NVIDIA' },
    { name: 'RX 7900 XTX',   vram: 24, bandwidth: 819.2, cat: 'AMD' },
    { name: 'RX 7900 XT',    vram: 20, bandwidth: 819.2, cat: 'AMD' },
    { name: 'RX 7900',       vram: 20, bandwidth: 819.2, cat: 'AMD' },
    { name: 'RX 7800 XT',    vram: 16, bandwidth: 632,   cat: 'AMD' },
    { name: 'RX 7700 XT',    vram: 12, bandwidth: 548,   cat: 'AMD' },
    { name: 'RX 6900 XT',    vram: 16, bandwidth: 512,   cat: 'AMD' },
    { name: 'RX 6800 XT',    vram: 16, bandwidth: 512,   cat: 'AMD' },
    { name: 'RX 6700 XT',    vram: 12, bandwidth: 384,   cat: 'AMD' },
    { name: 'Arc A770',      vram: 16, bandwidth: 448,   cat: 'Intel' },
    { name: 'Arc A750',      vram: 8,  bandwidth: 448,   cat: 'Intel' },
    // Apple Silicon (unified memory: VRAM = total system RAM)
    { name: 'M4 Max',       vram: 32, bandwidth: 546,   cat: 'Apple' },
    { name: 'M4 Pro',       vram: 24, bandwidth: 273,   cat: 'Apple' },
    { name: 'M4',           vram: 16, bandwidth: 120,   cat: 'Apple' },
    { name: 'M3 Max',       vram: 36, bandwidth: 400,   cat: 'Apple' },
    { name: 'M3 Pro',       vram: 18, bandwidth: 190,   cat: 'Apple' },
    { name: 'M3',           vram: 8,  bandwidth: 100,   cat: 'Apple' },
    { name: 'M2 Max',       vram: 32, bandwidth: 400,   cat: 'Apple' },
    { name: 'M2 Pro',       vram: 16, bandwidth: 240,   cat: 'Apple' },
    { name: 'M2',           vram: 8,  bandwidth: 100,   cat: 'Apple' },
    { name: 'M1 Max',       vram: 32, bandwidth: 400,   cat: 'Apple' },
    { name: 'M1 Pro',       vram: 16, bandwidth: 120,   cat: 'Apple' },
    { name: 'M1',           vram: 8,  bandwidth: 68.25, cat: 'Apple' },
  ];

  // Known-architecture lookup: families of common open-weight models, used as a
  // fallback when the HF detail endpoint has no config (GGUF-only repos).
  // Each model entry: params (billions), layers, kvHeads, headDim.
  const KNOWN_ARCHS = [
    { re: /qwen3/i, models: [
      { label: 'Qwen3 4B',  params: 4.05,  layers: 32, kvHeads: 8,  headDim: 128, kvLayers: 32 },
      { label: 'Qwen3 8B',  params: 8.19,  layers: 36, kvHeads: 8,  headDim: 128, kvLayers: 36 },
      { label: 'Qwen3 14B', params: 14.8,  layers: 40, kvHeads: 8,  headDim: 128, kvLayers: 40 },
      { label: 'Qwen3 27B', params: 27.0,  layers: 64, kvHeads: 4,  headDim: 256, kvLayers: 16 },
      { label: 'Qwen3 32B', params: 32.0,  layers: 48, kvHeads: 8,  headDim: 128, kvLayers: 48 },
      { label: 'Qwen3 72B', params: 76.0,  layers: 64, kvHeads: 8,  headDim: 128, kvLayers: 64 },
    ]},
    { re: /qwen2?\.?5/i, models: [
      { label: 'Qwen2.5 7B',  params: 7.61,  layers: 28, kvHeads: 4,  headDim: 128, kvLayers: 28 },
      { label: 'Qwen2.5 14B', params: 14.76, layers: 48, kvHeads: 8,  headDim: 128, kvLayers: 48 },
      { label: 'Qwen2.5 32B', params: 32.8,  layers: 64, kvHeads: 8,  headDim: 128, kvLayers: 64 },
      { label: 'Qwen2.5 72B', params: 76.2,  layers: 80, kvHeads: 8,  headDim: 128, kvLayers: 80 },
    ]},
    { re: /llama/i, models: [
      { label: 'Llama 3.2 3B',  params: 3.09,  layers: 28, kvHeads: 2,  headDim: 128, kvLayers: 28 },
      { label: 'Llama 3.1 8B',  params: 8.03,  layers: 32, kvHeads: 8,  headDim: 128, kvLayers: 32 },
      { label: 'Llama 2 13B',   params: 13.3,  layers: 40, kvHeads: 8,  headDim: 128, kvLayers: 40 },
      { label: 'Llama 3.1 70B', params: 70.6,  layers: 80, kvHeads: 8,  headDim: 128, kvLayers: 80 },
    ]},
    { re: /mistral/i, models: [
      { label: 'Mistral 7B',    params: 7.25,  layers: 32, kvHeads: 8,  headDim: 128, kvLayers: 32 },
      { label: 'Mistral 11B',   params: 11.4,  layers: 32, kvHeads: 8,  headDim: 128, kvLayers: 32 },
      { label: 'Mistral 24B',   params: 24.3,  layers: 40, kvHeads: 8,  headDim: 128, kvLayers: 40 },
      { label: 'Mistral 41B',   params: 41.4,  layers: 48, kvHeads: 8,  headDim: 128, kvLayers: 48 },
    ]},
    { re: /gemma/i, models: [
      { label: 'Gemma 2 9B',    params: 9.1,  layers: 28, kvHeads: 4,  headDim: 128, kvLayers: 28 },
      { label: 'Gemma 3 12B',   params: 12.3, layers: 48, kvHeads: 8,  headDim: 128, kvLayers: 48 },
      { label: 'Gemma 2 27B',   params: 26.8, layers: 46, kvHeads: 16, headDim: 144, kvLayers: 46 },
      { label: 'Gemma 3 27B',   params: 26.6, layers: 48, kvHeads: 16, headDim: 128, kvLayers: 48 },
    ]},
    { re: /phi/i, models: [
      { label: 'Phi-3 Mini 3.8',   params: 3.8,  layers: 32, kvHeads: 32, headDim: 96,  kvLayers: 32 },
      { label: 'Phi-3 Medium 14.7', params: 14.0, layers: 32, kvHeads: 16, headDim: 128, kvLayers: 32 },
      { label: 'Phi-3 Large 21.5',  params: 21.5, layers: 32, kvHeads: 16, headDim: 128, kvLayers: 32 },
    ]},
    { re: /command/i, models: [
      { label: 'Command R7B',   params: 7.9,  layers: 32, kvHeads: 8,  headDim: 128, kvLayers: 32 },
      { label: 'Command R 35B', params: 35.0, layers: 58, kvHeads: 16, headDim: 128, kvLayers: 58 },
    ]},
    { re: /gpt-?oss/i, models: [
      { label: 'gpt-oss 20B',  params: 20.9,  layers: 64, kvHeads: 8,  headDim: 72,    kvLayers: 64 },
      { label: 'gpt-oss 120B', params: 117.0, layers: 61, kvHeads: 16, headDim: 106.67, kvLayers: 61 },
    ]},
  ];

  // ─── DOM refs ────────────────────────────────────────────────────────────────

  const $ = (id) => document.getElementById(id);

  const el = {
    vram:        $('vram'),
    modelPreset: $('modelPreset'),
    weightQuant: $('weightQuant'),
    runtime:     $('runtime'),
    desktop:     $('desktop'),
    kvChart:     $('kvChart'),
    segDesktop:  $('segDesktop'),
    segWeights:  $('segWeights'),
    segMTP:      $('segMTP'),
    segRuntime:  $('segRuntime'),
    segKV:       $('segKV'),
    desktopGB:   $('desktopGB'),
    weightsGB:   $('weightsGB'),
    mtpGB:       $('mtpGB'),
    runtimeGB:   $('runtimeGB'),
    kvGB:        $('kvGB'),
    kvPerToken:  $('kvPerToken'),
    decodeSpeed: $('decodeSpeed'),
    maxContext:  $('maxContext'),
    warning:     $('warning'),
    hfId:        $('hfId'),
    hfToken:     $('hfToken'),
    hfImportBtn: $('hfImportBtn'),
    asymToggle:  $('asymToggle'),
    kvCheckSizes: $('kvCheckSizes'),
    mtpAsymRow:    $('mtpAsymRow'),
    mtpAsymToggle: $('mtpAsymToggle'),
    mtpKvCheckSizes: $('mtpKvCheckSizes'),
    segMtpKV:    $('segMtpKV'),
    mtpKvGB:     $('mtpKvGB'),

    ggufStatus:   $('ggufStatus'),
    kvChartTitle:  $('kvChartTitle'),
    kvChartHint:   $('kvChartHint'),
    gpuSelect:   $('gpuSelect'),
    bandwidth:   $('bandwidth'),
    helpVram:    $('helpVram'),
    helpDesktop: $('helpDesktop'),
    helpRuntime: $('helpRuntime'),
    speechTip:   $('speechTip'),
    shareBtn:    $('shareBtn'),
    shareStatus: $('shareStatus'),
  };

  // ─── State ───────────────────────────────────────────────────────────────────

  /** Set after a successful compute; read by updateVramBar. */
  let state = null; // { totalVRAM, desktopGB, weightsGB, runtimeGB, remainingGB, kvPerToken, maxContext, kvType }

  /** Models imported so far; read by readInputs/compute when one is selected in the model dropdown. */
  let importedModels = []; // [{ repoId, label, params, layers, kvHeads, headDim, kvLayers, variants }]

  /** The active KV cache type (one of KV_CACHE_TYPES). Defaults to 'f16'. */
  let selectedKvType = 'f16';
  let asymmetricMode = false;
  let selectedKType = 'f16';
  let selectedVType = 'f16';

  /** The active MTP draft KV cache type. Defaults to 'f16'. */
  let selectedMtpKvType = 'f16';
  let mtpAsymmetricMode = false;
  let selectedMtpKType  = 'f16';
  let selectedMtpVType  = 'f16';

  /** Resolve the active KV cache type object from selectedKvType. */
  function getKvType() {
    var t = KV_CACHE_TYPES.find(function (t) { return t.id === selectedKvType; });
    return t || KV_CACHE_TYPES.find(function (t) { return t.id === 'f16'; }); // fallback to f16
  }

  /** Resolve the active K cache type object. */
  function getKType() {
    var t = KV_CACHE_TYPES.find(function (t) { return t.id === selectedKType; });
    return t || KV_CACHE_TYPES.find(function (t) { return t.id === 'f16'; });
  }

  /** Resolve the active V cache type object. */
  function getVType() {
    var t = KV_CACHE_TYPES.find(function (t) { return t.id === selectedVType; });
    return t || KV_CACHE_TYPES.find(function (t) { return t.id === 'f16'; });
  }

  /** Resolve the active MTP draft KV cache type object from selectedMtpKvType. */
  function getMtpKvType() {
    var t = KV_CACHE_TYPES.find(function (t) { return t.id === selectedMtpKvType; });
    return t || KV_CACHE_TYPES.find(function (t) { return t.id === 'f16'; });
  }

  /** Resolve the active MTP draft K cache type object. */
  function getMtpKType() {
    var t = KV_CACHE_TYPES.find(function (t) { return t.id === selectedMtpKType; });
    return t || KV_CACHE_TYPES.find(function (t) { return t.id === 'f16'; });
  }

  /** Resolve the active MTP draft V cache type object. */
  function getMtpVType() {
    var t = KV_CACHE_TYPES.find(function (t) { return t.id === selectedMtpVType; });
    return t || KV_CACHE_TYPES.find(function (t) { return t.id === 'f16'; });
  }



  // ─── Formatting helpers ──────────────────────────────────────────────────────

  function fmtGB(v) {
    return v.toFixed(2) + ' GB';
  }



  function fmtInt(n) {
    return n.toLocaleString('en-US');
  }

  function formatDecimal(node) {
    var str = String(node.value).trim();
    if (str === '' || str.indexOf('.') === -1) {
      var val = parseFloat(str);
      if (!isNaN(val)) {
        node.value = val.toFixed(1);
      }
    }
  }

  // ─── Share link ─────────────────────────────────────────────────────────────────

  /** Encode a string as a URL-safe base64 (no padding, -/_ instead of +/). */
  function toBase64Url(str) {
    var bytes = unescape(encodeURIComponent(str));
    var b64 = btoa(bytes);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /** Decode a URL-safe base64 string back to the original. */
  function fromBase64Url(b64) {
    var s = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return decodeURIComponent(escape(atob(s)));
  }

  /** Copy text to the clipboard (Clipboard API with execCommand fallback for file://). */
  function copyText(text) {
    var copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (err) { /* clipboard API unavailable (e.g. file://) */ }
    if (!copied) {
      var ta = document.createElement('textarea');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      ta.value = text;
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    return copied;
  }

  /** Build a shareable URL encoding the current inputs as ?s=<base64url JSON>. */
  function buildShareUrl() {
    var obj = {
      gpu: el.gpuSelect.value,
      vram: +el.vram.value,
      bw:   +el.bandwidth.value,
      rt:   +el.runtime.value,
      dsk:  +el.desktop.value,
      hf:   el.modelPreset.value,
      q:    el.weightQuant.value,
      kv:   selectedKvType,
      asym: asymmetricMode ? 1 : 0,
      k:    selectedKType,
      v:    selectedVType,
      mtpkv:   selectedMtpKvType,
      mtpasym: mtpAsymmetricMode ? 1 : 0,
      mtapk:   selectedMtpKType,
      mtpv:    selectedMtpVType
    };
    var payload = toBase64Url(JSON.stringify(obj));
    var base = location.href.split('#')[0].replace(/\?.*$/, '');
    var sep = base.indexOf('?') === -1 ? '?' : '&';
    return base + sep + 's=' + payload;
  }

  /** Show the share-status line next to the Share button. */
  function showShareStatus(msg, persist) {
    el.shareStatus.textContent = msg;
    el.shareStatus.hidden = false;
    if (persist) return;
    setTimeout(function () { el.shareStatus.hidden = true; }, 2500);
  }

  /**
   * Restore pre-filled values from a ?s= share link (applied on page load).
   * Returns true if an async model import was kicked off; false otherwise.
   */
  function restoreFromUrl() {
    var params;
    try { params = new URLSearchParams(location.search); } catch (e) { return false; }
    var s = params.get('s');
    if (!s) return false;

    var obj;
    try { obj = JSON.parse(fromBase64Url(s)); } catch (e) { return false; }

    // Apply the numeric fields.
    if (typeof obj.gpu === 'string' && obj.gpu) el.gpuSelect.value = obj.gpu;
    if (typeof obj.vram === 'number') el.vram.value = String(obj.vram);
    if (typeof obj.bw === 'number')   el.bandwidth.value = String(obj.bw);
    if (typeof obj.dsk === 'number')  el.desktop.value = String(obj.dsk);
    if (typeof obj.rt === 'number')  el.runtime.value = String(obj.rt);

    if (obj.hf) {
      el.hfId.value = obj.hf;
      fetchGgufVariants({ q: obj.q, rt: obj.rt, kv: obj.kv, asym: obj.asym, k: obj.k, v: obj.v });
      showShareStatus('Restored from a shared link.', true);
      return true;
    }

    // No model in the link — apply the KV selection; init() will compute().
    if (obj.kv) selectedKvType = obj.kv;
    if (obj.asym) {
      asymmetricMode = true;
      el.asymToggle.checked = true;
      if (obj.k) selectedKType = obj.k;
      if (obj.v) selectedVType = obj.v;
    }
    if (obj.mtpkv) selectedMtpKvType = obj.mtpkv;
    if (obj.mtpasym) {
      mtpAsymmetricMode = true;
      el.mtpAsymToggle.checked = true;
      if (obj.mtpk) selectedMtpKType = obj.mtpk;
      if (obj.mtpv) selectedMtpVType = obj.mtpv;
    }
    return false;
  }

  // ─── GPU dropdown ─────────────────────────────────────────────────────────────

  function populateGpuDropdown() {
    var select = el.gpuSelect;
    var dropdown = select.querySelector('.gpu-select-dropdown');
    dropdown.innerHTML = '';
    var currentCat = null;
    GPU_LIST.forEach(function (g) {
      if (g.cat !== currentCat) {
        currentCat = g.cat;
        var group = document.createElement('div');
        group.className = 'gpu-select-group';
        group.textContent = g.cat;
        dropdown.appendChild(group);
      }
      var opt = document.createElement('div');
      opt.className = 'gpu-select-option';
      opt.textContent = g.name + ' — ' + g.vram + ' GB, ' + g.bandwidth + ' GB/s';
      opt.dataset.value = g.name;
      opt.addEventListener('click', function () {
        gpuSelectValue(g.name);
      });
      dropdown.appendChild(opt);
    });
    select.value = 'RTX 5080';
    el.vram.value = '16.0';
    el.bandwidth.value = '960';
  }

  /** Set the GPU dropdown value, update the trigger text, and highlight the active option. */
  function gpuSelectValue(name) {
    var select = el.gpuSelect;
    select.dataset.value = name;
    var g = GPU_LIST.find(function (x) { return x.name === name; });
    select.querySelector('.gpu-select-value').textContent = g
      ? g.name + ' — ' + g.vram + ' GB, ' + g.bandwidth + ' GB/s'
      : name;
    select.querySelectorAll('.gpu-select-option').forEach(function (o) {
      o.classList.toggle('gpu-select-option-active', o.dataset.value === name);
    });
    select.querySelector('.gpu-select-dropdown').hidden = true;
    if (g) {
      el.vram.value = g.vram.toFixed(1);
      el.bandwidth.value = String(g.bandwidth);
      compute();
    }
  }

  // Define a `value` property on the gpuSelect element for backward compatibility.
  Object.defineProperty(el.gpuSelect, 'value', {
    get: function () { return this.dataset.value; },
    set: function (val) { gpuSelectValue(val); }
  });

  // ─── Populate dropdowns ──────────────────────────────────────────────────────

  function populateModelDropdown() {
    var select = el.modelPreset;
    select.innerHTML = '';
    importedModels.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m.repoId;
      opt.textContent = m.label;
      select.appendChild(opt);
    });
  }

  function populateWeightDropdown() {
    var select = el.weightQuant;
    select.innerHTML = '';
    var m = getSelectedModel();
    if (m) {
      var sorted = m.variants.slice().sort(function (a, b) { return b.sizeGB - a.sizeGB; });
      sorted.forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.id + ' — ' + v.sizeGB.toFixed(2) + ' GB';
        select.appendChild(opt);
      });
    }
  }

  /** Fetch architectural specs (layers, kvHeads, headDim) from the HF model detail endpoint. */
  function fetchModelSpecs(repoId, token) {
    var url = 'https://huggingface.co/api/models/' + repoId;
    return fetchJson(url, token).then(function (data) {
      var config = data.config || {};
      var numAttentionHeads = config.num_attention_heads || 0;
      var layers = config.num_hidden_layers || null;
      return {
        layers:  layers,
        kvHeads: config.num_key_value_heads || numAttentionHeads || null,
        headDim: (config.hidden_size && numAttentionHeads) ? config.hidden_size / numAttentionHeads : null,
        kvLayers: layers
      };
    }).catch(function () {
      return { layers: null, kvHeads: null, headDim: null, kvLayers: null };
    });
  }

  /** Estimate params (in billions) from the largest quant's file size (assumes ~8 bits). */
  function estimateParams(variants) {
    var largest = null;
    variants.forEach(function (v) {
      if (!v.mtp && (!largest || v.sizeGB > largest.sizeGB)) largest = v;
    });
    if (!largest) return null;
    return largest.sizeGB;
  }

  /** Extract param count (in billions) from the repo name (e.g. "27B" → 27). */
  function parseParamsFromName(repoId) {
    var m = repoId.match(/(\d+(?:\.\d+)?)B/i);
    if (m) return parseFloat(m[1]);
    return null;
  }

  /** Estimate runtime overhead (GB) based on model size (1 slot, all layers). */
  function estimateRuntimeOverhead(params) {
    if (params <= 4)  return 0.6;
    if (params <= 9)  return 0.85;
    if (params <= 15) return 1.1;
    if (params <= 27) return 1.3;
    if (params <= 40) return 1.4;
    return 1.75;
  }

  /**
   * Fall back to the KNOWN_ARCHS table when the HF endpoint has no config.
   * Matches the repo name against a family regex, then picks the model closest
   * to the estimated params. Returns null if no family matches, or if the
   * closest model is > 25% off from the estimate.
   */
  function matchKnownArch(repoId, params) {
    if (params == null || !(params > 0)) return null;
    var lower = repoId.toLowerCase();
    var best = null;
    KNOWN_ARCHS.forEach(function (fam) {
      if (!fam.re.test(lower)) return;
      fam.models.forEach(function (m) {
        var d = Math.abs(m.params - params);
        if (!best || d < best.d) best = { d: d, m: m };
      });
    });
    if (!best) return null;
    var ref = Math.max(params, best.m.params);
    if (Math.abs(best.m.params - params) / ref > 0.25) return null;
    return best.m;
  }

  /** Resolve the active weight quant from the selected model's variants. */
  function getWeightQuant() {
    var m = getSelectedModel();
    if (m) {
      var id = el.weightQuant.value;
      var v = m.variants.find(function (v) { return v.id === id; });
      if (v) return v;
    }
    return null;
  }

  /** Select the largest quant that fits in the available VRAM (given current
   * settings), including MTP variants. Sets the weight-quant dropdown and
   * returns the selected variant, or null if no variant fits. */
  function selectBestWeightQuant() {
    var m = getSelectedModel();
    if (!m) return null;
    var available = parseFloat(el.vram.value) - parseFloat(el.runtime.value) - parseFloat(el.desktop.value);
    var best = null;
    m.variants.forEach(function (v) {
      if (v.sizeGB <= available && (!best || v.sizeGB > best.sizeGB)) best = v;
    });
    el.weightQuant.value = best ? best.id : '';
    return best;
  }

  // ─── Read & validate inputs ──────────────────────────────────────────────────

  /** Resolve the imported model matching the current model-dropdown selection. */
  function getSelectedModel() {
    if (!importedModels.length) return null;
    return importedModels.find(function (m) { return m.repoId === el.modelPreset.value; }) || null;
  }

  function readInputs() {
    var imported = getSelectedModel();
    return {
      imported:  imported,
      totalVRAM: parseFloat(el.vram.value),
      params:    imported ? imported.params : NaN,
      layers:    imported ? imported.layers : NaN,
      kvHeads:   imported ? imported.kvHeads : NaN,
      headDim:   imported ? imported.headDim : NaN,
      kvLayers:  imported ? imported.kvLayers : NaN,
      runtime:   parseFloat(el.runtime.value),
      desktop:   parseFloat(el.desktop.value),
    };
  }

  function validate(inp) {
    var problems = [];
    if (!inp.imported) problems.push('Import a model to get started.');
    if (!(inp.totalVRAM > 0)) problems.push('Total VRAM must be > 0');
    if (inp.runtime < 0)      problems.push('Model runtime must be ≥ 0');
    if (inp.desktop < 0)      problems.push('Desktop overhead must be ≥ 0');
    return problems;
  }

  // ─── Core computation ────────────────────────────────────────────────────────

  function compute() {
    var inp = readInputs();
    var problems = validate(inp);

    var weightQuant = getWeightQuant();

    if (problems.length > 0) {
      showWarning(problems.join('; '));
      clearResults();
      return;
    }

    // Guard: architecture specs missing (e.g. an imported model with null layers/kvHeads/headDim).
    var kvBase = 2 * inp.kvLayers * inp.kvHeads * inp.headDim;
    if (!(kvBase > 0)) {
      showWarning('Architecture specs (layers / KV heads / head dim) are missing for this model — cannot compute the KV cache.');
      clearResults();
      return;
    }

    // Guard: weight quant not selected.
    if (!weightQuant) {
      showWarning('Select a weight quant from the dropdown.');
      clearResults();
      return;
    }

    var weightsGB, mtpGB, mtpKvPerToken = 0;
    var m = getSelectedModel();
    if (m && weightQuant.mtp) {
      // MTP variant selected: the base model is the non-MTP flavor of the same quant.
      var base = m.variants.find(function (v) { return !v.mtp && v.quant === weightQuant.quant; });
      weightsGB = base ? base.sizeGB : weightQuant.sizeGB;
      mtpGB = weightQuant.sizeGB - weightsGB;
      // MTP draft KV cache: 1 layer, same kvHeads/headDim as the main model.
      mtpKvBase = 2 * 1 * inp.kvHeads * inp.headDim;
      if (mtpAsymmetricMode) {
        var mtpKType = getMtpKType();
        var mtpVType = getMtpVType();
        mtpKvPerToken = (mtpKvBase / 2) * (mtpKType.bytesPerElem + mtpVType.bytesPerElem);
      } else {
        mtpKvPerToken = mtpKvBase * getMtpKvType().bytesPerElem;
      }
    } else {
      weightsGB = weightQuant.sizeGB;
      mtpGB = 0;
    }
    var remainingGB = inp.totalVRAM - weightsGB - mtpGB - inp.runtime - inp.desktop;

    el.weightsGB.textContent   = fmtGB(weightsGB);
    el.mtpGB.textContent      = fmtGB(mtpGB);
    el.runtimeGB.textContent   = fmtGB(inp.runtime);
    el.desktopGB.textContent   = fmtGB(inp.desktop);
    el.kvGB.textContent        = '0.00 GB';
    el.mtpKvGB.textContent     = mtpKvPerToken > 0 ? '0.00 GB' : '–';
    renderVramBar(inp.totalVRAM, inp.desktop, weightsGB, mtpGB, inp.runtime, mtpKvPerToken > 0 ? 0 : 0, 0);

    // ── KV cache: symmetric (same type for K & V) or asymmetric (K ≠ V) ────────
    var kvPerToken, kvType;
    if (asymmetricMode) {
      var kType = getKType();
      var vType = getVType();
      kvPerToken = (kvBase / 2) * (kType.bytesPerElem + vType.bytesPerElem);
    } else {
      kvType = getKvType();
      kvPerToken = kvBase * kvType.bytesPerElem;
    }
    var totalKvPerToken = kvPerToken + mtpKvPerToken;
    var maxContext = remainingGB > 0 ? Math.floor(remainingGB * 1e9 / totalKvPerToken) : 0;
    var activeMainSel = asymmetricMode ? { kId: selectedKType, vId: selectedVType } : { id: selectedKvType };
    var activeDraftSel = mtpAsymmetricMode ? { kId: selectedMtpKType, vId: selectedMtpVType } : { id: selectedMtpKvType };
    var mtpKvBase = weightQuant.mtp ? 2 * 1 * inp.kvHeads * inp.headDim : 0;

    // Show/hide the MTP draft KV card.
    el.mtpAsymRow.hidden = !weightQuant.mtp;
    el.mtpKvCheckSizes.hidden = !weightQuant.mtp;

    if (remainingGB <= 0) {
      el.maxContext.textContent  = '0 tokens';
      el.kvPerToken.textContent   = '–';
      el.mtpKvGB.textContent      = '–';
      el.decodeSpeed.textContent  = '–';
      renderKvArea(remainingGB, kvBase, mtpKvBase, activeMainSel, activeDraftSel, weightQuant.mtp);
      setKvChartTitle();
      showWarning('Model does not fit in available VRAM. Increase VRAM, use a smaller quant, or reduce overheads.');
      return;
    }

    if (maxContext <= 0) {
      el.maxContext.textContent  = '0 tokens';
      el.kvPerToken.textContent   = '–';
      el.mtpKvGB.textContent      = '–';
      el.decodeSpeed.textContent  = '–';
      renderKvArea(remainingGB, kvBase, mtpKvBase, activeMainSel, activeDraftSel, weightQuant.mtp);
      setKvChartTitle();
      showWarning('Not enough VRAM for even one token of context. The KV cache alone exceeds the remaining VRAM.');
      return;
    }

    el.warning.hidden = true;

    state = { totalVRAM: inp.totalVRAM, desktopGB: inp.desktop, weightsGB: weightsGB, mtpGB: mtpGB, runtimeGB: inp.runtime, remainingGB: remainingGB, kvPerToken: kvPerToken, mtpKvPerToken: mtpKvPerToken, maxContext: maxContext };
    renderKvArea(remainingGB, kvBase, mtpKvBase, activeMainSel, activeDraftSel, weightQuant.mtp);
    setKvChartTitle();
    el.kvPerToken.textContent = (totalKvPerToken / 1000).toFixed(1) + ' MB';
    el.maxContext.textContent  = fmtInt(maxContext) + ' tokens';

    // Decode speed: memory-bandwidth bound.
    // τ = accepted length (avg tokens per forward pass). With MTP (K=3 draft),
    // τ ≈ 2.0 (typical acceptance rate ~0.6: 1 + 0.6 + 0.36 + 0.216 ≈ 2.2,
    // rounded conservatively). Without MTP, τ = 1.
    var bw = parseFloat(el.bandwidth.value);
    if (bw > 0) {
      var weightBytes = (weightsGB + mtpGB) * 1e9;
      var mtpFactor = weightQuant.mtp ? 2 : 1;
      var tokPerSec = mtpFactor * (bw * 1e9) / (weightBytes + totalKvPerToken);
      el.decodeSpeed.textContent = fmtInt(Math.round(tokPerSec)) + ' tok/s';
    } else {
      el.decodeSpeed.textContent = '–';
    }

    updateVramBar();
  }

  // ─── VRAM allocation bar ─────────────────────────────────────────────────────

  const VRAM_SEG_NAMES = ['Desktop apps', 'Model runtime', 'Model weights', 'KV cache', 'MTP head', 'MTP KV cache'];

  /**
   * Render the horizontal VRAM allocation bar.
   * Each segment width = segmentGB / totalVRAM × 100%.
   * If kvGB ≤ 0 (overfull), scale the 5 used segments to fill 100%.
   * Each segment stores name/size/pct in data-* attributes for the
   * speech-bubble tooltip (shown on hover, zero delay) and shows an inline
   * percentage label when its displayed width is wide enough (≥ 10%).
   */
  function renderVramBar(totalVRAM, desktopGB, weightsGB, mtpGB, runtimeGB, mtpKvGB, kvGB) {
    var segs = [el.segDesktop, el.segRuntime, el.segWeights, el.segKV, el.segMTP, el.segMtpKV];
    var segGBs = [desktopGB, runtimeGB, weightsGB, kvGB, mtpGB, mtpKvGB];

    // Hide MTP segments + legend items when a non-MTP variant is selected.
    el.segMTP.hidden      = mtpGB <= 0;
    el.segMtpKV.hidden    = mtpKvGB <= 0;
    el.mtpGB.closest('.legend-item').style.display    = mtpGB <= 0 ? 'none' : '';
    el.mtpKvGB.closest('.legend-item').style.display  = mtpKvGB <= 0 ? 'none' : '';

    if (totalVRAM <= 0) {
      segs.forEach(function (s) {
        s.style.width = '0%';
        s.dataset.name = '';
        s.dataset.gb = '';
        s.dataset.pct = '';
        var label = s.querySelector('.vram-seg-label');
        if (label) label.textContent = '';
      });
      hideTip();
      return;
    }

    // truePcts: each segment's true share of totalVRAM (used for tooltips/labels).
    var truePcts = segGBs.map(function (gb) { return (gb / totalVRAM) * 100; });

    // widthPcts: the displayed width of each segment. In the overfull case the
    // 5 used segments are scaled to fill 100%; KV is 0.
    var overfull = kvGB <= 0;
    var widthPcts;
    if (overfull) {
      var usedTotal = desktopGB + runtimeGB + weightsGB + mtpGB + mtpKvGB;
      widthPcts = segGBs.map(function (gb, i) {
        return ((i === 0 || i === 1 || i === 2 || i === 4 || i === 5) && usedTotal > 0) ? (gb / usedTotal) * 100 : 0;
      });
    } else {
      widthPcts = truePcts.slice();
    }

    segs.forEach(function (s, i) {
      s.style.width = widthPcts[i] + '%';
      s.dataset.name = VRAM_SEG_NAMES[i];
      s.dataset.gb = segGBs[i];
      s.dataset.pct = truePcts[i];
      var label = s.querySelector('.vram-seg-label');
      if (label) label.textContent = widthPcts[i] >= 10 ? Math.round(truePcts[i]) + '%' : '';
    });
  }

  // ─── Speech-bubble tooltip ──────────────────────────────────────────────────

  var HELP_CMDS = {
    vram:    "nvidia-smi --query-gpu=memory.total --format=csv,noheader | awk '{v=$1/1024; s=sprintf(\"%.2f\",v); sub(/0+$/,\"\",s); sub(/\\.$/,\"\",s); print s}'",
    desktop: "nvidia-smi --query-gpu=memory.used  --format=csv,noheader | awk '{v=$1/1024; s=sprintf(\"%.2f\",v); sub(/0+$/,\"\",s); sub(/\\.$/,\"\",s); print s}'",
  };

  // macOS equivalents (Apple Silicon unified memory)
  var HELP_CMDS_MACOS = {
    vram:    "system_profiler SPHardwareDataType | grep 'Memory'",
    desktop: "top -l 1 | grep 'Mem:'",
  };

  /** Show the shared speech-bubble tooltip above the anchor, zero delay. */
  function showTip(html, anchor) {
    el.speechTip.innerHTML = html;
    el.speechTip.hidden = false;
    var r = anchor.getBoundingClientRect();
    el.speechTip.style.left = (r.left + r.width / 2) + 'px';
    el.speechTip.style.bottom = (window.innerHeight - r.top + 8) + 'px';
  }

  function hideTip() {
    el.speechTip.hidden = true;
  }

  var _hideTimer = null;
  function scheduleHide() {
    if (_hideTimer) clearTimeout(_hideTimer);
    _hideTimer = setTimeout(hideTip, 300);
  }
  function cancelHide() {
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
  }

  function vramSegTipHtml(s) {
    return '<div class="speech-bubble-title">' + s.dataset.name + '</div>' +
           '<div class="speech-bubble-line">' + fmtGB(parseFloat(s.dataset.gb)) + ' (' + parseFloat(s.dataset.pct).toFixed(1) + '%)</div>';
  }

  /** Check if the selected GPU is an Apple Silicon Mac. */
  function isAppleSilicon() {
    var name = el.gpuSelect.value;
    return /^M[1234]/.test(name);
  }

  function helpTipHtml(kind) {
    var macos = isAppleSilicon();
    var cmds = macos ? HELP_CMDS_MACOS : HELP_CMDS;
    var title = kind === 'vram' ? (macos ? 'Total memory (GB) — Apple unified RAM' : 'Total VRAM (GB)') : 'Desktop / other apps (GB)';
    var note = kind === 'vram'
      ? (macos
        ? 'Run this and paste the printed GB value into the field. On Apple Macs, Total VRAM is the unified system memory.'
        : 'Run this and paste the printed GB value into the field.')
      : (macos
        ? 'Stop any running models before measuring, then run this and paste the printed GB value into the field.'
        : 'Stop any running models before measuring, then run this and paste the printed GB value into the field.');
    return '<div class="speech-bubble-title">' + title + '</div>' +
           '<div class="speech-bubble-cmd-wrap">' +
           '<code class="speech-bubble-cmd">' + cmds[kind] + '</code>' +
           '<button class="copy-btn" aria-label="Copy command"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="8" height="8" rx="1"/><path d="M2 10 L2 2 L10 2 L10 6 M2 10 L6 10"/></svg></button>' +
           '</div>' +
           '<div class="speech-bubble-note">' + note + '</div>';
  }

  /** Tooltip for the runtime overhead field — explains the auto-fill on import/selection. */
  function runtimeTipHtml() {
    return '<div class="speech-bubble-title">Model runtime (GB)</div>' +
           '<div class="speech-bubble-note">Auto-filled when a model is imported or selected in the dropdown. Scales with model size: ≤4B → 0.6, ≤9B → 0.85, ≤15B → 1.1, ≤27B → 1.3, ≤40B → 1.4, &gt;40B → 1.75. You can override it manually.</div>';
  }

  // ─── KV cache bar chart ──────────────────────────────────────────────────────

  /** Set the chart title/hint for the KV cache type charts (main + MTP draft). */
  function setKvChartTitle() {
    var m = getSelectedModel();
    var wq = getWeightQuant();
    var isMtp = m && wq && wq.mtp;
    if (m) {
      if (isMtp) {
        el.kvChartTitle.textContent = 'Main / Draft KV cache types';
        el.kvChartHint.textContent = 'Rows are main KV types, columns are draft KV types. Each cell shows the max context tokens for that (main, draft) pair. Check boxes to include/exclude types. Click a cell to select that pair — the VRAM allocation card updates accordingly.';
      } else if (asymmetricMode) {
        el.kvChartTitle.textContent = 'KV cache types';
        el.kvChartHint.textContent = 'Each bar shows max context for a K/V cache pair. Check boxes to include/exclude types. Click a bar to select that pair.';
      } else {
        el.kvChartTitle.textContent = 'KV cache types';
        el.kvChartHint.textContent = 'Each bar shows the max context tokens for a llama.cpp KV cache type (--cache-type-k / --cache-type-v). Click a bar to select that KV type — the VRAM allocation card updates accordingly.';
      }
    } else {
      el.kvChartTitle.textContent = 'KV cache types';
      el.kvChartHint.textContent = 'Import a model to see its quant variants.';
    }
  }

  /**
   * Shared bar-chart renderer for the KV cache type charts (main + MTP draft).
   * Symmetric mode: one bar per type (same type for K & V).
   * Asymmetric mode: one bar per (K, V) pair of checked types.
   * Bar width ∝ max context tokens, sorted ascending.
   */
  function _renderKvChart(container, remainingGB, kvBase, activeId, activeKId, activeVId, asymmetricMode, btnContainer, onSelectType, onSelectPair) {
    container.innerHTML = '';

    if (remainingGB <= 0 || kvBase <= 0) {
      return;
    }

    // Collect active type ids from the button set
    var checkedIds = [];
    btnContainer.querySelectorAll('.kv-size-btn').forEach(function (btn) {
      if (btn.classList.contains('kv-size-btn-active')) checkedIds.push(btn.dataset.id);
    });

    if (checkedIds.length === 0) {
      return;
    }

    var rows;
    if (asymmetricMode) {
      // Generate all permutations of checked types,
      // de-duplicating mirrors: keep only pairs where kBytes >= vBytes
      rows = [];
      checkedIds.forEach(function (kId) {
        checkedIds.forEach(function (vId) {
          var kType = KV_CACHE_TYPES.find(function (t) { return t.id === kId; });
          var vType = KV_CACHE_TYPES.find(function (t) { return t.id === vId; });
          if (kType.bytesPerElem < vType.bytesPerElem) return; // mirror: greater-first pair is kept
          var kvPerToken = (kvBase / 2) * (kType.bytesPerElem + vType.bytesPerElem);
          var maxCtx = Math.floor(remainingGB * 1e9 / kvPerToken);
          rows.push({ kId: kId, vId: vId, maxCtx: maxCtx });
        });
      });
      rows.sort(function (a, b) { return a.maxCtx - b.maxCtx; });
    } else {
      // Symmetric mode: one bar per checked type
      rows = checkedIds.map(function (id) {
        var t = KV_CACHE_TYPES.find(function (t) { return t.id === id; });
        var kvPerToken = kvBase * t.bytesPerElem;
        var maxCtx = Math.floor(remainingGB * 1e9 / kvPerToken);
        return { type: t, maxCtx: maxCtx };
      }).sort(function (a, b) { return a.maxCtx - b.maxCtx; });
    }

    var maxCtx = 0;
    rows.forEach(function (r) { if (r.maxCtx > maxCtx) maxCtx = r.maxCtx; });

    rows.forEach(function (r) {
      var row = document.createElement('div');
      var label, track, fill, value;
      var isActive;
      var labelStr;
      var color;

      if (asymmetricMode) {
        labelStr = r.kId + ' / ' + r.vId;
        isActive = (r.kId === activeKId && r.vId === activeVId);
        var family = r.kId.split('_')[0].toUpperCase();
        color = KV_FAMILY_COLORS[family];
      } else {
        labelStr = r.type.label;
        isActive = (r.type.id === activeId);
        var family = r.type.id.split('_')[0].toUpperCase();
        color = KV_FAMILY_COLORS[family];
      }

      row.className = 'kv-bar-row' + (isActive ? ' kv-bar-active' : '');
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', labelStr + ' — ' + fmtInt(r.maxCtx) + ' tokens');

      label = document.createElement('span');
      label.className = 'kv-bar-label' + (asymmetricMode ? ' kv-bar-label-asym' : '');
      label.textContent = labelStr;

      track = document.createElement('div');
      track.className = 'kv-bar-track';

      fill = document.createElement('div');
      fill.className = 'kv-bar-fill';
      fill.style.width = maxCtx > 0 ? (r.maxCtx / maxCtx) * 100 + '%' : '0%';
      if (color) fill.style.background = color;

      track.appendChild(fill);

      value = document.createElement('span');
      value.className = 'kv-bar-value';
      value.textContent = fmtInt(r.maxCtx) + ' tokens';

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(value);
      container.appendChild(row);

      if (asymmetricMode) {
        row.addEventListener('click', function () { onSelectPair(r.kId, r.vId); });
        row.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectPair(r.kId, r.vId);
          }
        });
      } else {
        row.addEventListener('click', function () { onSelectType(r.type.id); });
        row.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectType(r.type.id);
          }
        });
      }
    });
  }

  /** Render the main KV cache type bar chart (non-MTP). */
  function renderKvChart(remainingGB, kvBase, activeId, activeKId, activeVId) {
    _renderKvChart(el.kvChart, remainingGB, kvBase, activeId, activeKId, activeVId, asymmetricMode, el.kvCheckSizes, selectKvType, selectKvPair);
  }

  // ─── MTP draft KV cache spreadsheet ──────────────────────────────────────────

  /** Collect the checked main KV selections from the main button set. */
  function mainSelections(asym) {
    var checkedIds = [];
    el.kvCheckSizes.querySelectorAll('.kv-size-btn').forEach(function (btn) {
      if (btn.classList.contains('kv-size-btn-active')) checkedIds.push(btn.dataset.id);
    });
    if (!asym) return checkedIds.map(function (id) { return { id: id }; });
    var sels = [];
    checkedIds.forEach(function (kId) {
      checkedIds.forEach(function (vId) {
        var kType = KV_CACHE_TYPES.find(function (t) { return t.id === kId; });
        var vType = KV_CACHE_TYPES.find(function (t) { return t.id === vId; });
        if (kType.bytesPerElem < vType.bytesPerElem) return; // mirror dedup
        sels.push({ kId: kId, vId: vId });
      });
    });
    return sels;
  }

  /** Collect the checked draft KV selections from the draft button set. */
  function draftSelections(asym) {
    var checkedIds = [];
    el.mtpKvCheckSizes.querySelectorAll('.kv-size-btn').forEach(function (btn) {
      if (btn.classList.contains('kv-size-btn-active')) checkedIds.push(btn.dataset.id);
    });
    if (!asym) return checkedIds.map(function (id) { return { id: id }; });
    var sels = [];
    checkedIds.forEach(function (kId) {
      checkedIds.forEach(function (vId) {
        var kType = KV_CACHE_TYPES.find(function (t) { return t.id === kId; });
        var vType = KV_CACHE_TYPES.find(function (t) { return t.id === vId; });
        if (kType.bytesPerElem < vType.bytesPerElem) return; // mirror dedup
        sels.push({ kId: kId, vId: vId });
      });
    });
    return sels;
  }

  function _selKey(sel, asym) {
    return asym ? sel.kId + '/' + sel.vId : sel.id;
  }
  function _selLabel(sel, asym) {
    return asym ? sel.kId + ' / ' + sel.vId : sel.id;
  }
  function _selFamily(sel, asym) {
    return (asym ? sel.kId : sel.id).split('_')[0].toUpperCase();
  }

  /** Max context tokens for a (main, draft) selection pair. */
  function _cellMaxCtx(remainingGB, kvBase, mtpKvBase, mSel, dSel, mAsym, dAsym) {
    var mainPerTok, mtpPerTok;
    if (mAsym) {
      var mk = KV_CACHE_TYPES.find(function (t) { return t.id === mSel.kId; });
      var mv = KV_CACHE_TYPES.find(function (t) { return t.id === mSel.vId; });
      mainPerTok = (kvBase / 2) * (mk.bytesPerElem + mv.bytesPerElem);
    } else {
      var mt = KV_CACHE_TYPES.find(function (t) { return t.id === mSel.id; });
      mainPerTok = kvBase * mt.bytesPerElem;
    }
    if (dAsym) {
      var dk = KV_CACHE_TYPES.find(function (t) { return t.id === dSel.kId; });
      var dv = KV_CACHE_TYPES.find(function (t) { return t.id === dSel.vId; });
      mtpPerTok = (mtpKvBase / 2) * (dk.bytesPerElem + dv.bytesPerElem);
    } else {
      var dt = KV_CACHE_TYPES.find(function (t) { return t.id === dSel.id; });
      mtpPerTok = mtpKvBase * dt.bytesPerElem;
    }
    return Math.floor(remainingGB * 1e9 / (mainPerTok + mtpPerTok));
  }

  /** Select a (main, draft) spreadsheet cell: update the selection and recompute. */
  function selectKvSheetCell(mSel, dSel, mAsym, dAsym) {
    if (mAsym) {
      selectedKType = mSel.kId;
      selectedVType = mSel.vId;
    } else {
      selectedKvType = mSel.id;
    }
    if (dAsym) {
      selectedMtpKType = dSel.kId;
      selectedMtpVType = dSel.vId;
    } else {
      selectedMtpKvType = dSel.id;
    }
    compute();
  }

  /** Interpolate red→yellow→green across [min, max] (t = 0.5 → yellow),
   *  then dim the result by blending in the card's gray background. */
  function _sheetColor(value, min, max) {
    var t = (max === min) ? 0.5 : (value - min) / (max - min);
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    var red    = [248, 81, 73];   // #f85149
    var yellow = [240, 200, 72];  // #f0c848
    var green  = [63, 185, 80];   // #3fb950
    var c;
    if (t <= 0.5) {
      c = red.map(function (r, i) { return r + (yellow[i] - r) * (t / 0.5); });
    } else {
      c = yellow.map(function (r, i) { return r + (green[i] - r) * ((t - 0.5) / 0.5); });
    }
    // Dim: blend in the card's gray background (--surface-2, #1c2128).
    var gray = [28, 33, 40];
    var dim = 0.3;
    c = c.map(function (r, i) { return Math.round(r + (gray[i] - r) * dim); });
    return 'rgb(' + c.join(', ') + ')';
  }

  /** Render the MTP draft KV cache spreadsheet (rows = main types, cols = draft types). */
  function renderKvSheet(remainingGB, kvBase, mtpKvBase, activeMainSel, activeDraftSel, mAsym, dAsym) {
    el.kvChart.innerHTML = '';
    if (remainingGB <= 0 || kvBase <= 0 || mtpKvBase <= 0) return;

    var mSels = mainSelections(mAsym);
    var dSels = draftSelections(dAsym);
    if (mSels.length === 0 || dSels.length === 0) return;

    // Track the min/max cell value so each cell can be colored
    // red (lowest) → yellow (median) → green (highest).
    var min = Infinity, max = -Infinity;
    mSels.forEach(function (m) {
      dSels.forEach(function (d) {
        var v = _cellMaxCtx(remainingGB, kvBase, mtpKvBase, m, d, mAsym, dAsym);
        if (v < min) min = v;
        if (v > max) max = v;
      });
    });

    var activeMKey = _selKey(activeMainSel, mAsym);
    var activeDKey = _selKey(activeDraftSel, dAsym);

    var table = document.createElement('table');
    table.className = 'kv-sheet-table';

    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    var corner = document.createElement('td');
    corner.className = 'kv-sheet-corner';
    corner.textContent = 'Main \\ Draft';
    headRow.appendChild(corner);
    dSels.forEach(function (d) {
      var th = document.createElement('th');
      th.className = 'kv-sheet-col-header';
      th.textContent = _selLabel(d, dAsym);
      var fam = _selFamily(d, dAsym);
      if (KV_FAMILY_COLORS[fam]) th.style.color = KV_FAMILY_COLORS[fam];
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    mSels.forEach(function (m) {
      var row = document.createElement('tr');
      var th = document.createElement('th');
      th.className = 'kv-sheet-row-header';
      th.textContent = _selLabel(m, mAsym);
      var fam = _selFamily(m, mAsym);
      if (KV_FAMILY_COLORS[fam]) th.style.color = KV_FAMILY_COLORS[fam];
      row.appendChild(th);
      dSels.forEach(function (d) {
        var maxCtx = _cellMaxCtx(remainingGB, kvBase, mtpKvBase, m, d, mAsym, dAsym);
        var td = document.createElement('td');
        var mMatch = (_selKey(m, mAsym) === activeMKey);
        var dMatch = (_selKey(d, dAsym) === activeDKey);
        var isActive = (mMatch && dMatch);
        var isCross = (mMatch || dMatch) && !isActive;
        td.className = 'kv-sheet-cell' + (isActive ? ' kv-sheet-cell-active' : (isCross ? ' kv-sheet-cell-cross' : ''));
        td.style.backgroundColor = _sheetColor(maxCtx, min, max);
        td.textContent = fmtInt(maxCtx);
        td.setAttribute('role', 'button');
        td.setAttribute('tabindex', '0');
        td.setAttribute('aria-label', _selLabel(m, mAsym) + ' × ' + _selLabel(d, dAsym) + ' — ' + fmtInt(maxCtx) + ' tokens');
        td.addEventListener('click', function () { selectKvSheetCell(m, d, mAsym, dAsym); });
        td.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectKvSheetCell(m, d, mAsym, dAsym);
          }
        });
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    el.kvChart.appendChild(table);
  }

  /** Render the KV area: bars (non-MTP) or the MTP spreadsheet. */
  function renderKvArea(remainingGB, kvBase, mtpKvBase, activeMainSel, activeDraftSel, isMtp) {
    if (isMtp) {
      renderKvSheet(remainingGB, kvBase, mtpKvBase, activeMainSel, activeDraftSel, asymmetricMode, mtpAsymmetricMode);
    } else {
      renderKvChart(remainingGB, kvBase, selectedKvType, selectedKType, selectedVType);
    }
  }

  // ─── VRAM bar sync ───────────────────────────────────────────────────────────

  function updateVramBar() {
    if (!state) return;
    var mainKvUsedGB = state.maxContext * state.kvPerToken / 1e9;
    var mtpKvUsedGB  = state.mtpKvPerToken ? state.maxContext * state.mtpKvPerToken / 1e9 : 0;
    el.kvGB.textContent      = fmtGB(mainKvUsedGB);
    el.mtpKvGB.textContent   = mtpKvUsedGB > 0 ? fmtGB(mtpKvUsedGB) : '–';
    renderVramBar(state.totalVRAM, state.desktopGB, state.weightsGB, state.mtpGB, state.runtimeGB, mtpKvUsedGB, mainKvUsedGB);
  }

  // ─── Warning & reset ─────────────────────────────────────────────────────────

  function showWarning(msg) {
    el.warning.textContent = msg;
    el.warning.hidden = false;
  }

  function clearResults() {
    el.weightsGB.textContent   = '–';
    el.mtpGB.textContent      = '–';
    el.runtimeGB.textContent   = '–';
    el.desktopGB.textContent   = '–';
    el.kvGB.textContent        = '–';
    el.mtpKvGB.textContent     = '–';
    el.kvPerToken.textContent  = '–';
    el.decodeSpeed.textContent = '–';
    el.maxContext.textContent  = '–';
    state = null;
    renderVramBar(0, 0, 0, 0, 0, 0, 0, 0);
    renderKvChart(0, 0, null, null, null);
    el.mtpAsymRow.hidden = true;
    el.mtpKvCheckSizes.hidden = true;
    setKvChartTitle();
  }

  // ─── Hugging Face import ─────────────────────────────────────────────────────
  function fetchJson(url, token) {
    var headers = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, { headers: headers }).then(function (res) {
      if (!res.ok) {
        throw new Error(res.status === 401
          ? '401 — this model is gated. Add an access token and try again.'
          : res.status + ' — could not load ' + url);
      }
      return res.json();
    });
  }

  // ─── GGUF quant variant fetch ─────────────────────────────────────────────────

  function setGgufStatus(msg, kind) {
    el.ggufStatus.textContent = msg;
    el.ggufStatus.hidden = false;
    el.ggufStatus.className = 'import-status ' + (kind || '');
  }

  /**
   * Parse the quant tag from a GGUF filename.
   * Returns { quant, mtp } — for MTP variant files (last segment is "mtp"),
   * the quant is the second-to-last segment and mtp is true.
   * The quant is uppercased so it matches the variant dropdown ids (GGUF filenames
   * use lowercase tags like "iq2_s", "q4_k_m").
   */
  function parseQuantTag(path) {
    var base = path.replace(/\.gguf$/, '');
    // Strip multi-part suffix (e.g. "-0000-of-0002") so the quant
    // is the segment before it, not the part number.
    base = base.replace(/-\d{4}-of-\d{4}$/i, '');
    var parts = base.split('-');
    var last = parts[parts.length - 1];
    if (last.toLowerCase() === 'mtp' && parts.length >= 2) {
      return { quant: parts[parts.length - 2].toUpperCase(), mtp: true };
    }
    return { quant: last.toUpperCase(), mtp: false };
  }

  /** Search Hugging Face for GGUF repos matching a base model name. */
  function searchGgufRepos(baseName, token) {
    var url = 'https://huggingface.co/api/models?search=' + encodeURIComponent(baseName) + '&limit=30';
    return fetchJson(url, token).then(function (data) {
      var candidates = data.map(function (m) { return m.id; });
      if (candidates.length === 0) return [];

      var normalized = baseName.toLowerCase().trim();

      // Score each candidate by closeness to the base name.
      // Exact match = 0, prefix match = extra length,
      // substring match = 100 + extra length, no match = 999.
      // The "gguf" name filter was removed: the tree endpoint
      // (fetchQuants) is the source of truth for GGUF files.
      return candidates
        .map(function (id) {
          var stripped = id.toLowerCase().replace(/[-\s]?gguf$/i, '').replace(/[-\s]+$/i, '');
          var score;
          if (stripped === normalized) {
            score = 0;
          } else if (stripped.indexOf(normalized) === 0) {
            score = stripped.length - normalized.length;
          } else if (stripped.indexOf(normalized) !== -1) {
            score = 100 + (stripped.length - normalized.length);
          } else {
            score = 999;
          }
          return { id: id, score: score };
        })
        .sort(function (a, b) { return a.score - b.score; })
        .map(function (c) { return c.id; });
    });
  }

  /**
   * Fetch GGUF file sizes from the tree endpoint of a repo.
   * MTP variant files are separate models — each gets its own row,
   * labeled `{{quant}} (MTP)` where quant is the second-to-last segment.
   */
  function fetchQuants(repoId, token) {
    var url = 'https://huggingface.co/api/models/' + repoId + '/tree/main?recursive=false&expand=true';
    return fetchJson(url, token).then(function (files) {
      return files
        .filter(function (f) {
          var base = f.path.split('/').pop();
          return base.endsWith('.gguf') && !base.startsWith('imatrix');
        })
        .map(function (f) {
          var tag = parseQuantTag(f.path);
          return {
            quant: tag.quant,
            sizeBytes: f.size,
            sizeGB: f.size / 1e9,
            mtp: tag.mtp,
            id: tag.mtp ? tag.quant + ' (MTP)' : tag.quant,
          };
        });
    });
  }

  /** Select a KV cache type: update the selection and recompute. */
  function selectKvType(id) {
    selectedKvType = id;
    compute();
  }

  /** Select a (K, V) pair for asymmetric mode: update the selection and recompute. */
  function selectKvPair(kId, vId) {
    selectedKType = kId;
    selectedVType = vId;
    compute();
  }

  /** Select an MTP draft KV cache type: update the selection and recompute. */
  function selectMtpKvType(id) {
    selectedMtpKvType = id;
    compute();
  }

  /** Select an MTP draft (K, V) pair for asymmetric mode: update the selection and recompute. */
  function selectMtpKvPair(kId, vId) {
    selectedMtpKType = kId;
    selectedMtpVType = vId;
    compute();
  }

  /** Main entry point: search for GGUF repos, fetch specs + variants, populate dropdowns.
   * `restore` (optional) carries the pre-filled values from a ?s= share link so the
   * import can re-apply the shared quant / runtime / KV selection after its defaults. */
  function fetchGgufVariants(restore) {
    var baseName = el.hfId.value.trim();
    if (!baseName) {
      setGgufStatus('Enter a model name to search for GGUF variants.', 'error');
      return;
    }
    var token = el.hfToken.value.trim();

    el.hfImportBtn.disabled = true;
    setGgufStatus('Searching for GGUF repos…', 'loading');

    searchGgufRepos(baseName, token).then(function (repos) {
      if (repos.length === 0) {
        setGgufStatus('No GGUF repos found for "' + baseName + '".', 'error');
        return;
      }

      var repoId = repos[0];
      setGgufStatus('Fetching specs and variants from ' + repoId + '…', 'loading');

      return fetchModelSpecs(repoId, token).then(function (specs) {
        return fetchQuants(repoId, token).then(function (variants) {
          if (variants.length === 0) {
            setGgufStatus(repoId + ' has no GGUF files. Import only works with GGUF repos (files ending in .gguf).', 'error');
            return;
          }
          var archSpecs = specs;
          var specsEstimated = false;
          var params = parseParamsFromName(repoId) || estimateParams(variants);
          if (specs.layers == null || specs.kvHeads == null || specs.headDim == null) {
            archSpecs = matchKnownArch(repoId, params);
            if (!archSpecs) {
              setGgufStatus('Could not determine architecture specs (layers / KV heads / head dim) for ' + repoId + '.', 'error');
              return;
            }
            specsEstimated = true;
          }
          var model = {
            repoId:   repoId,
            label:    repoId,
            params:   params,
            layers:   archSpecs.layers,
            kvHeads:  archSpecs.kvHeads,
            headDim:  archSpecs.headDim,
            kvLayers: archSpecs.kvLayers || archSpecs.layers,
            variants: variants,
          };
          var existing = importedModels.findIndex(function (m) { return m.repoId === repoId; });
          if (existing >= 0) importedModels[existing] = model;
          else importedModels.push(model);
          // A ?s= share link names its own KV selection — apply it over the
          // current (preserved) selection.
          if (restore) {
            if (restore.kv) selectedKvType = restore.kv;
            if (restore.asym) {
              asymmetricMode = true;
              el.asymToggle.checked = true;
              if (restore.k) selectedKType = restore.k;
              if (restore.v) selectedVType = restore.v;
            }
            if (restore.mtpkv) selectedMtpKvType = restore.mtpkv;
            if (restore.mtpasym) {
              mtpAsymmetricMode = true;
              el.mtpAsymToggle.checked = true;
              if (restore.mtpk) selectedMtpKType = restore.mtpk;
              if (restore.mtpv) selectedMtpVType = restore.mtpv;
            }
          }

          // Select the imported model, then populate the weight dropdown
          // with the imported model's quant variants.
          populateModelDropdown();
          el.modelPreset.value = repoId;
          populateWeightDropdown();

          // Set runtime overhead based on model size (before the fit check,
          // so the available-VRAM calculation uses the current setting).
          el.runtime.value = estimateRuntimeOverhead(params).toFixed(2);

          // A ?s= share link carries its own runtime overhead — preserve it.
          if (restore && typeof restore.rt === 'number') el.runtime.value = String(restore.rt);

          // Auto-select the largest quant that fits in the available VRAM
          // given the current settings (including MTP variants).
          var best = selectBestWeightQuant();

          // A ?s= share link names a specific quant — apply it if it exists in
          // the imported model (even if it doesn't fit; the warning will show).
          if (restore && restore.q) {
            var m = getSelectedModel();
            if (m && m.variants.some(function (v) { return v.id === restore.q; })) {
              el.weightQuant.value = restore.q;
              best = m.variants.find(function (v) { return v.id === restore.q; });
            }
          }
          compute();
          if (best) {
            setGgufStatus('Imported ' + repoId + ' — ' + variants.length + ' quant variants. Auto-selected ' + best.quant + (specsEstimated ? '. Architecture specs estimated from a known ' + archSpecs.label + '.' : '.'), 'ok');
          } else {
            setGgufStatus('No quant variant for ' + repoId + ' fits in the available VRAM. Increase VRAM or reduce the overheads.', 'error');
          }
        });
      });
    }).catch(function (err) {
      var msg = (err && err.message) ? err.message : 'GGUF fetch failed.';
      if (err instanceof TypeError) {
        msg = 'Could not reach Hugging Face — check your internet connection.';
      }
      setGgufStatus(msg, 'error');
    }).finally(function () {
      el.hfImportBtn.disabled = false;
    });
  }

  // ─── Init ────────────────────────────────────────────────────────────────────

  function init() {
    populateModelDropdown();
    populateWeightDropdown();

    // When the model changes, repopulate the weight-quant dropdown with
    // that model's own variants, auto-select the largest quant that fits
    // (including MTP variants), and refresh the runtime estimate.
    el.modelPreset.addEventListener('change', function () {
      var m = getSelectedModel();
      populateWeightDropdown();
      if (m) {
        // Set runtime overhead for the new model, then auto-select the largest
        // quant that fits in the available VRAM given current settings.
        el.runtime.value = estimateRuntimeOverhead(m.params).toFixed(2);
        selectBestWeightQuant();
      }
      compute();
    });

    [el.vram, el.weightQuant, el.runtime, el.desktop
    ].forEach(function (node) {
      node.addEventListener('input', compute);
    });

    // Format decimal fields on blur (ensure at least 1 decimal place)
    [el.vram, el.runtime, el.desktop].forEach(function (node) {
      node.addEventListener('blur', function () { formatDecimal(node); });
    });

    el.hfImportBtn.addEventListener('click', function () { fetchGgufVariants(); });
    el.hfId.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') fetchGgufVariants();
    });

    // Copy the current inputs into a shareable ?s= link and to the clipboard.
    el.shareBtn.addEventListener('click', function () {
      copyText(buildShareUrl());
      showShareStatus('Link copied.');
    });

    // GPU dropdown: click to toggle, click outside to close, keyboard navigation.
    var gpuTrigger = el.gpuSelect.querySelector('.gpu-select-trigger');
    var gpuDropdown = el.gpuSelect.querySelector('.gpu-select-dropdown');
    gpuTrigger.addEventListener('click', function () {
      gpuDropdown.hidden = !gpuDropdown.hidden;
    });
    document.addEventListener('click', function (e) {
      if (!el.gpuSelect.contains(e.target)) {
        gpuDropdown.hidden = true;
      }
    });
    gpuTrigger.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        if (e.key === 'Escape') {
          gpuDropdown.hidden = true;
          return;
        }
        if (gpuDropdown.hidden) {
          gpuDropdown.hidden = false;
        }
        var options = Array.prototype.slice.call(gpuDropdown.querySelectorAll('.gpu-select-option'));
        if (!options.length) return;
        var idx = options.findIndex(function (o) { return o.classList.contains('gpu-select-option-active'); });
        if (e.key === 'ArrowDown') {
          idx = (idx + 1) % options.length;
        } else if (e.key === 'ArrowUp') {
          idx = (idx - 1 + options.length) % options.length;
        } else {
          return;
        }
        gpuSelectValue(options[idx].dataset.value);
      }
    });

    // Speech-bubble tooltips (300ms hide delay): VRAM bar segments + help circles
    [el.segDesktop, el.segRuntime, el.segWeights, el.segKV, el.segMTP, el.segMtpKV].forEach(function (s) {
      s.addEventListener('mouseenter', function () {
        cancelHide();
        if (s.dataset.name) showTip(vramSegTipHtml(s), s);
      });
      s.addEventListener('mouseleave', scheduleHide);
    });

    [[el.helpVram, 'vram'], [el.helpDesktop, 'desktop']].forEach(function (pair) {
      pair[0].addEventListener('mouseenter', function () { cancelHide(); showTip(helpTipHtml(pair[1]), pair[0]); });
      pair[0].addEventListener('mouseleave', scheduleHide);
      pair[0].addEventListener('click', function () { cancelHide(); showTip(helpTipHtml(pair[1]), pair[0]); });
    });

    // Runtime overhead tooltip
    el.helpRuntime.addEventListener('mouseenter', function () { cancelHide(); showTip(runtimeTipHtml(), el.helpRuntime); });
    el.helpRuntime.addEventListener('mouseleave', scheduleHide);
    el.helpRuntime.addEventListener('click', function () { cancelHide(); showTip(runtimeTipHtml(), el.helpRuntime); });

    // Tooltip stays visible while the mouse hovers over the bubble itself
    el.speechTip.addEventListener('mouseenter', cancelHide);
    el.speechTip.addEventListener('mouseleave', scheduleHide);

    // Copy-to-clipboard button (event delegation)
    el.speechTip.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.copy-btn') : null;
      if (!btn) return;
      var code = el.speechTip.querySelector('.speech-bubble-cmd');
      if (code) {
        var text = code.textContent;
        var copied = false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
            copied = true;
          }
        } catch (err) { /* clipboard API unavailable (e.g. file://) */ }
        if (!copied) {
          var ta = document.createElement('textarea');
          ta.style.position = 'absolute';
          ta.style.left = '-9999px';
          ta.value = text;
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
      }
      var originalHtml = btn.innerHTML;
      btn.textContent = '✓';
      setTimeout(function () { btn.innerHTML = originalHtml; }, 1000);
    });

    window.addEventListener('scroll', function () {
      hideTip();
      el.gpuSelect.querySelector('.gpu-select-dropdown').hidden = true;
    });

    // Generate the single row of cache-size buttons
    KV_CACHE_TYPES.forEach(function (t) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kv-size-btn kv-size-btn-active';
      btn.textContent = t.id;
      btn.dataset.id = t.id;
      btn.setAttribute('aria-pressed', 'true');
      btn.addEventListener('click', function () {
        var active = btn.classList.contains('kv-size-btn-active');
        btn.classList.toggle('kv-size-btn-active', !active);
        btn.setAttribute('aria-pressed', String(!active));
        compute();
      });
      el.kvCheckSizes.appendChild(btn);
    });

    el.asymToggle.addEventListener('change', function () {
      asymmetricMode = el.asymToggle.checked;
      // `change` only fires on a flip, so a now-off checkbox was just on.
      // Carry the pair's larger type into the symmetric selection in that case.
      if (!asymmetricMode) {
        var kType = getKType();
        var vType = getVType();
        selectedKvType = kType.bytesPerElem >= vType.bytesPerElem ? kType.id : vType.id;
      }
      compute();
    });

    // Generate the MTP draft cache-size buttons
    KV_CACHE_TYPES.forEach(function (t) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mtp-kv-size-btn kv-size-btn kv-size-btn-active';
      btn.textContent = t.id;
      btn.dataset.id = t.id;
      btn.setAttribute('aria-pressed', 'true');
      btn.addEventListener('click', function () {
        var active = btn.classList.contains('kv-size-btn-active');
        btn.classList.toggle('kv-size-btn-active', !active);
        btn.setAttribute('aria-pressed', String(!active));
        compute();
      });
      el.mtpKvCheckSizes.appendChild(btn);
    });

    el.mtpAsymToggle.addEventListener('change', function () {
      mtpAsymmetricMode = el.mtpAsymToggle.checked;
      if (!mtpAsymmetricMode) {
        var mtpKType = getMtpKType();
        var mtpVType = getMtpVType();
        selectedMtpKvType = mtpKType.bytesPerElem >= mtpVType.bytesPerElem ? mtpKType.id : mtpVType.id;
      }
      compute();
    });

    // Format initial values to ensure decimal places
    [el.vram, el.runtime, el.desktop].forEach(formatDecimal);

    populateGpuDropdown();

    // Keep the JS asymmetric state in sync with the checkbox on load —
    // the checkbox is the user-facing source of truth (a browser may
    // restore it to checked after a reload).
    asymmetricMode = el.asymToggle.checked;
    mtpAsymmetricMode = el.mtpAsymToggle.checked;

    // If opened with a ?s= share link, restore the pre-filled values
    // (and auto-import the model). If an async import was kicked off,
    // its final compute() handles the rest; otherwise compute now.
    if (!restoreFromUrl()) {
      compute();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

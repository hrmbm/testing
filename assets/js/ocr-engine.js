/**
 * HR&GA Workspace browser-only OCR.
 * PP-OCRv6 tiny is selected for mobile: ~6.3 MB combined model assets.
 * Model archives are cached with Cache Storage when available. Candidate images
 * are passed to PaddleOCR in-page and are never uploaded by this module.
 */
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm';
const MODEL_CDN = 'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/';
const CACHE_NAME = 'portal-karir-ocr-models-v3';
const DET_MODEL = 'PP-OCRv6_tiny_det';
const REC_MODEL = 'PP-OCRv6_tiny_rec';
const FETCH_TIMEOUT_MS = 12000;
const IMPORT_TIMEOUT_MS = 15000;
const CREATE_TIMEOUT_MS = 25000;
const ENGINE_TOTAL_TIMEOUT_MS = 30000;

let sdkPromise = null;
let enginePromise = null;
const modelObjectUrls = new Set();

function timeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
  ]).finally(() => clearTimeout(timer));
}

function formatBytes(value) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchBytes(url, label, onStatus) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { mode: 'cors', cache: 'force-cache', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} saat mengunduh ${label}.`);
    const total = Number(response.headers.get('content-length')) || 0;
    if (!response.body?.getReader) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      onStatus(`${label}: ${formatBytes(bytes.length)} diterima.`);
      return bytes;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      const percent = total ? ` (${Math.min(100, Math.round(received / total * 100))}%)` : '';
      onStatus(`${label}: ${formatBytes(received)}${total ? ` / ${formatBytes(total)}` : ''}${percent}`);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`Unduhan ${label} melewati batas 12 detik. Periksa koneksi lalu coba lagi.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}


async function cacheRead(modelName) {
  try {
    if (!('caches' in window)) return null;
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(`/__portal_karir_models__/${modelName}.tar`);
    return response ? await response.blob() : null;
  } catch { return null; }
}
async function cacheWrite(modelName, blob) {
  try {
    if (!('caches' in window)) return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(`/__portal_karir_models__/${modelName}.tar`, new Response(blob, {
      headers: { 'Content-Type': 'application/x-tar' }
    }));
  } catch { /* Private mode / quota: continue with in-memory model URL. */ }
}

async function loadModelUrl(modelName, onStatus) {
  const cached = await cacheRead(modelName);
  if (cached) {
    onStatus(`Model ${modelName.replace('PP-OCRv6_tiny_', '')}: memakai cache perangkat.`);
    const objectUrl = URL.createObjectURL(cached);
    modelObjectUrls.add(objectUrl);
    return objectUrl;
  }

  onStatus(`Mengunduh model ${modelName.replace('PP-OCRv6_tiny_', '')}…`);
  // Do not cascade into a second model host after a timeout. The fallback
  // mirror previously doubled first-run loading time on slow mobile networks.
  const base = `${MODEL_CDN}${modelName}_onnx_infer.tar`;
  const bytes = await fetchBytes(base, `Model ${modelName}`, onStatus);
  const archive = new Blob([bytes], { type: 'application/x-tar' });

  await cacheWrite(modelName, archive);
  const objectUrl = URL.createObjectURL(archive);
  modelObjectUrls.add(objectUrl);
  return objectUrl;
}

async function loadSdk(onStatus) {
  if (!sdkPromise) {
    onStatus('Memuat runtime OCR browser…');
    sdkPromise = timeout(import(SDK_URL), IMPORT_TIMEOUT_MS, 'Runtime OCR tidak berhasil dimuat dalam 15 detik.')
      .catch(error => { sdkPromise = null; throw error; });
  }
  return sdkPromise;
}

async function createEngine(onStatus) {
  const { PaddleOCR } = await loadSdk(onStatus);
  if (typeof PaddleOCR?.create !== 'function') throw new Error('Runtime OCR tidak menyediakan API yang dibutuhkan.');
  const [detUrl, recUrl] = await Promise.all([
    loadModelUrl(DET_MODEL, onStatus),
    loadModelUrl(REC_MODEL, onStatus)
  ]);
  onStatus('Menyiapkan mesin OCR di perangkat…');
  const engine = await timeout(PaddleOCR.create({
    textDetectionModelName: DET_MODEL,
    textDetectionModelAsset: { url: detUrl },
    textRecognitionModelName: REC_MODEL,
    textRecognitionModelAsset: { url: recUrl },
    textDetectionBatchSize: 1,
    textRecognitionBatchSize: 2,
    ortOptions: {
      backend: 'auto',
      wasmPaths: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/',
      numThreads: Math.max(1, Math.min(2, Number(navigator.hardwareConcurrency) || 1)),
      simd: true
    }
  }), CREATE_TIMEOUT_MS, 'Inisialisasi model OCR melebihi 25 detik. Coba lagi saat koneksi lebih stabil.');
  return engine;
}

function getEngine(onStatus = () => {}) {
  if (!enginePromise) {
    enginePromise = timeout(
      createEngine(onStatus),
      ENGINE_TOTAL_TIMEOUT_MS,
      'Pemuatan OCR melewati batas 30 detik. Periksa koneksi lalu ulangi pemindaian.'
    ).catch(error => { enginePromise = null; throw error; });
  }
  return enginePromise;
}

export async function recognizeWithPaddle(image, onStatus = () => {}) {
  const engine = await getEngine(onStatus);
  onStatus('Membaca teks KTP di perangkat…');
  const [result] = await timeout(engine.predict(image), 22000, 'Pembacaan OCR melewati 22 detik. Ambil foto yang lebih jelas lalu ulangi pemindaian.');
  const items = Array.isArray(result?.items) ? result.items : [];
  const text = items.map(item => String(item?.text || '').trim()).filter(Boolean).join('\n');
  const scores = items.map(item => Number(item?.score)).filter(Number.isFinite);
  const confidence = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
  return {
    text,
    confidence,
    items: items.map(item => ({ text: String(item?.text || ''), score: Number(item?.score) })),
    metrics: result?.metrics || null,
    runtime: result?.runtime || null
  };
}

window.addEventListener('pagehide', () => {
  for (const objectUrl of modelObjectUrls) URL.revokeObjectURL(objectUrl);
  modelObjectUrls.clear();
});

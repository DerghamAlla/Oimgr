import * as ort from 'onnxruntime-web';

// Configure environment
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/';
ort.env.wasm.numThreads = 1;

const CACHE_NAME = 'obr-model-cache-v1';

// Model configuration matching reference site URLs
export const MODELS = {
    'u2netp': {
        name: 'Fast (u2netp)',
        url: 'https://huggingface.co/robertwt7/bg-remover-models/resolve/main/onnx/u2netp.onnx',
        size: 320
    },
    'silueta': {
        name: 'Balanced (silueta)',
        url: 'https://huggingface.co/robertwt7/bg-remover-models/resolve/main/onnx/silueta.onnx',
        size: 320
    },
    'rmbg_quant': {
        name: 'Ultra Quant (RMBG)',
        url: 'https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model_quantized.onnx',
        size: 1024
    },
    'rmbg_fp16': {
        name: 'Ultra FP16 (RMBG)',
        url: 'https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model_fp16.onnx',
        size: 1024
    },
    'rmbg_full': {
        name: 'Ultra Full (RMBG)',
        url: 'https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model.onnx',
        size: 1024
    }
};

let session = null;
let currentModel = null;

async function loadModel(modelKey, onProgress) {
    if (session && currentModel === modelKey) return session;

    const config = MODELS[modelKey];
    const cache = await caches.open(CACHE_NAME);
    let response = await cache.match(config.url);

    if (!response) {
        onProgress('Downloading model...');
        console.log(`[removeBg] Fetching model from ${config.url}`);
        response = await fetch(config.url);
        if (!response.ok) throw new Error(`Model download failed: ${response.statusText}`);

        // Clone for caching and streaming
        const responseToCache = response.clone();
        await cache.put(config.url, responseToCache);
    } else {
        console.log(`[removeBg] Loading model from cache: ${config.url}`);
        onProgress('Loading from cache...');
    }

    const reader = response.body.getReader();
    const contentLength = +response.headers.get('Content-Length');

    let receivedLength = 0;
    const chunks = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;
        if (contentLength) {
            onProgress(`Downloading: ${Math.round((receivedLength / contentLength) * 100)}%`);
        } else {
            onProgress(`Downloading: ${(receivedLength / 1024 / 1024).toFixed(1)}MB`);
        }
    }

    const blob = new Blob(chunks);
    const arrayBuffer = await blob.arrayBuffer();

    onProgress('Initializing AI...');
    session = await ort.InferenceSession.create(arrayBuffer, {
        executionProviders: ['wasm']
    });
    currentModel = modelKey;
    return session;
}

async function preprocess(imageBitmap, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size).data;
    const input = new Float32Array(size * size * 3);

    // Normalization factors
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];

    for (let i = 0; i < size * size; i++) {
        input[i] = (imageData[i * 4] / 255.0 - mean[0]) / std[0]; // R
        input[i + size * size] = (imageData[i * 4 + 1] / 255.0 - mean[1]) / std[1]; // G
        input[i + 2 * size * size] = (imageData[i * 4 + 2] / 255.0 - mean[2]) / std[2]; // B
    }

    return new ort.Tensor('float32', input, [1, 3, size, size]);
}

export const removeBackground = async (imageFile, modelKey, onProgress) => {
    try {
        const sess = await loadModel(modelKey, onProgress);
        const imageBitmap = await createImageBitmap(imageFile);
        const { size } = MODELS[modelKey];
        const inputTensor = await preprocess(imageBitmap, size);

        onProgress('Removing background...');
        const feeds = {};
        feeds[sess.inputNames[0]] = inputTensor;
        const output = await sess.run(feeds);
        const maskData = output[sess.outputNames[0]].data;

        onProgress('Finalizing...');
        const canvas = document.createElement('canvas');
        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageBitmap, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = size;
        maskCanvas.height = size;
        const maskCtx = maskCanvas.getContext('2d');
        const maskImageData = maskCtx.createImageData(size, size);

        for (let i = 0; i < maskData.length; i++) {
            const val = Math.round(maskData[i] * 255);
            maskImageData.data[i * 4] = val;
            maskImageData.data[i * 4 + 1] = val;
            maskImageData.data[i * 4 + 2] = val;
            maskImageData.data[i * 4 + 3] = 255;
        }
        maskCtx.putImageData(maskImageData, 0, 0);

        const finalMaskCanvas = document.createElement('canvas');
        finalMaskCanvas.width = canvas.width;
        finalMaskCanvas.height = canvas.height;
        const finalMaskCtx = finalMaskCanvas.getContext('2d');
        finalMaskCtx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
        const finalMaskData = finalMaskCtx.getImageData(0, 0, canvas.width, canvas.height).data;

        for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i + 3] = finalMaskData[i];
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL('image/png');

    } catch (err) {
        console.error('[removeBg] Error:', err);
        throw err;
    }
};

/**
 * Utility to clear model cache
 */
export const clearModelCache = async () => {
    return await caches.delete(CACHE_NAME);
};

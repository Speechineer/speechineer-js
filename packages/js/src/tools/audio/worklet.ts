/**
 * Generate worklet code with configurable sample rate and frame duration.
 */
function buildWorkletCode(sampleRate: number, frameDurationMs: number): string {
  const frameSamples = Math.round((sampleRate * frameDurationMs) / 1000);
  return `// Int16 PCM @ ${sampleRate}Hz mono, ${frameDurationMs}ms frames

class PCMWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.inRate = sampleRate;
    this.outRate = ${sampleRate};
    this.step = this.inRate / this.outRate;
    this.fracPos = 0;
    this.accum = [];
    this.FRAME = ${frameSamples};
  }

  static get parameterDescriptors() { return []; }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const ch0 = input[0] ?? new Float32Array(0);
    let mono;
    if (input.length === 1) {
      mono = ch0;
    } else {
      const ch1 = input[1];
      const len = Math.min(ch0.length, ch1.length);
      mono = new Float32Array(len);
      for (let i = 0; i < len; i++) mono[i] = 0.5 * (ch0[i] + ch1[i]);
    }

    const outLen = Math.floor(mono.length / this.step);
    const out = new Int16Array(outLen);
    let pos = this.fracPos;
    for (let i = 0; i < outLen; i++) {
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, mono.length - 1);
      const frac = pos - i0;
      const s = mono[i0] + (mono[i1] - mono[i0]) * frac;
      const v = Math.max(-1, Math.min(1, s));
      out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
      pos += this.step;
    }
    this.fracPos = pos - Math.floor(pos);

    this.accum.push(out);
    let total = this.accum.reduce((n, a) => n + a.length, 0);
    while (total >= this.FRAME) {
      const frame = new Int16Array(this.FRAME);
      let offset = 0;
      while (offset < this.FRAME) {
        const head = this.accum[0];
        const take = Math.min(head.length, this.FRAME - offset);
        frame.set(head.subarray(0, take), offset);
        offset += take;
        if (take === head.length) {
          this.accum.shift();
        } else {
          this.accum[0] = head.subarray(take);
        }
      }
      total -= this.FRAME;
      this.port.postMessage(frame);
    }
    return true;
  }
}

registerProcessor('pcm-worklet', PCMWorkletProcessor);
`;
}

const blobUrlCache = new Map<string, string>();

function cacheKey(sampleRate: number, frameDurationMs: number): string {
  return `${sampleRate}:${frameDurationMs}`;
}

export function getWorkletBlobUrl(sampleRate: number, frameDurationMs: number): string {
  if (
    typeof sampleRate !== 'number' ||
    typeof frameDurationMs !== 'number' ||
    Number.isNaN(sampleRate) ||
    Number.isNaN(frameDurationMs)
  ) {
    throw new Error('sampleRate and frameDurationMs are required (the session answer provides them)');
  }
  const key = cacheKey(sampleRate, frameDurationMs);
  const cached = blobUrlCache.get(key);
  if (cached) return cached;

  const code = buildWorkletCode(sampleRate, frameDurationMs);
  const blob = new Blob([code], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  blobUrlCache.set(key, url);
  return url;
}

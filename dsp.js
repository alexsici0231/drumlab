/**
 * Local browser DSP for drum tuning. FFT estimates resonant spectral peaks;
 * it deliberately does NOT claim every selected peak is the drum fundamental.
 * 32768-point real-valued FFT via an iterative complex radix-2 transform.
 */
const FFT_SIZE = 32768;
const EPS = 1e-12;
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function noteForHz(hz) {
  if (!Number.isFinite(hz) || hz <= 0) return null;
  const midiFloat = 69 + 12 * Math.log2(hz / 440);
  const midi = Math.round(midiFloat);
  return { note: `${NOTE_NAMES[(midi % 12 + 12) % 12]}${Math.floor(midi / 12) - 1}`, cents: Math.round((midiFloat - midi) * 100) };
}

function fftInPlace(re, im) {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len;
    const cs = Math.cos(angle), sn = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let k = 0; k < (len >> 1); k++) {
        const even = i + k, odd = even + (len >> 1);
        const tr = re[odd] * wr - im[odd] * wi;
        const ti = re[odd] * wi + im[odd] * wr;
        re[odd] = re[even] - tr;
        im[odd] = im[even] - ti;
        re[even] += tr;
        im[even] += ti;
        const nextWr = wr * cs - wi * sn;
        wi = wr * sn + wi * cs;
        wr = nextWr;
      }
    }
  }
}

function calcFrequency(bin, mags, binSize) {
  const a = Math.log(mags[bin - 1] + EPS);
  const b = Math.log(mags[bin] + EPS);
  const c = Math.log(mags[bin + 1] + EPS);
  const denominator = a - 2 * b + c;
  const offset = Math.abs(denominator) > 1e-8 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / denominator)) : 0;
  return (bin + offset) * binSize;
}

/** @returns {{ok:boolean,reason?:string,peaks?:Array,chosen?:Object,curve?:Array,quality?:string,snr?:number,rms?:number}} */
export function analyzeDrumHit(samples, sampleRate, opts = {}) {
  if (!samples || !sampleRate || samples.length < sampleRate * 0.17) return { ok: false, reason: 'Слишком короткий удар' };
  const offset = Math.round(sampleRate * 0.042);
  const available = samples.length - offset;
  const length = Math.min(available, Math.round(sampleRate * 0.34), FFT_SIZE);
  if (length < Math.round(sampleRate * 0.16)) return { ok: false, reason: 'Недостаточно сигнала' };
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  let mean = 0;
  for (let i = 0; i < length; i++) mean += samples[i + offset];
  mean /= length;
  let sumSquares = 0;
  for (let i = 0; i < length; i++) {
    const x = samples[i + offset] - mean;
    sumSquares += x * x;
    // Tukey window (alpha=.26), less attack suppression than a full Hann window.
    const edge = .13;
    const t = i / (length - 1);
    let w = 1;
    if (t < edge) w = .5 * (1 - Math.cos(Math.PI * t / edge));
    else if (t > 1 - edge) w = .5 * (1 - Math.cos(Math.PI * (1 - t) / edge));
    re[i] = x * w;
  }
  const rms = Math.sqrt(sumSquares / length);
  if (rms < .0006) return { ok: false, reason: 'Слишком тихий сигнал' };
  fftInPlace(re, im);
  const binSize = sampleRate / FFT_SIZE;
  const requestedMin = Math.max(30, Number(opts.minHz) || 40);
  const requestedMax = Math.min(1200, Number(opts.maxHz) || 800);
  const minBin = Math.max(2, Math.floor(requestedMin / binSize));
  const maxBin = Math.min(FFT_SIZE / 2 - 2, Math.ceil(requestedMax / binSize));
  const mags = new Float64Array(maxBin + 2);
  let biggest = 0;
  for (let k = minBin - 1; k <= maxBin + 1; k++) {
    const v = Math.hypot(re[k], im[k]);
    mags[k] = v;
    if (k >= minBin && k <= maxBin) biggest = Math.max(biggest, v);
  }
  if (biggest <= EPS) return { ok: false, reason: 'Тон не найден' };
  const rawPeaks = [];
  let sumMagnitude = 0, num = 0;
  for (let k = minBin; k <= maxBin; k++) {
    sumMagnitude += mags[k]; num++;
    if (mags[k] >= mags[k-1] && mags[k] > mags[k+1]) {
      const hz = calcFrequency(k, mags, binSize);
      if (hz >= requestedMin && hz <= requestedMax) rawPeaks.push({ hz, amplitude: mags[k] });
    }
  }
  rawPeaks.sort((a,b) => b.amplitude - a.amplitude);
  const loud = rawPeaks.filter(p => p.amplitude > biggest * .14);
  const peakPool = loud.length ? loud : rawPeaks.slice(0,1);
  let allowed = peakPool;
  const lockHz = Number(opts.lockHz);
  if (lockHz > 0) {
    allowed = peakPool.filter(p => Math.abs(p.hz - lockHz) / lockHz <= .18);
    if (!allowed.length) {
      return {ok:false,reason:'Частота вне фильтра ±18%. Повторите удар или сбросьте фильтр.',peaks:peakPool.slice(0,6),curve:makeCurve(mags, minBin, maxBin, binSize, biggest),minHz:requestedMin,maxHz:requestedMax};
    }
  }
  const chosen = allowed[0];
  if (!chosen) return { ok: false, reason: 'Нет выраженного частотного пика' };
  const strength = (chosen.amplitude / biggest) * 100;
  const snr = 20 * Math.log10((chosen.amplitude + EPS) / (sumMagnitude / Math.max(1, num) + EPS));
  // A high ratio is useful but does not guarantee that this peak is a fundamental.
  const quality = snr >= 16 ? 'good' : snr >= 9 ? 'medium' : 'low';
  return {
    ok: true,
    chosen: { hz: chosen.hz, amplitude: chosen.amplitude, strength },
    peaks: peakPool.slice(0, 6).map(p => ({hz: p.hz, strength: Math.round(100 * p.amplitude / biggest)})),
    curve: makeCurve(mags, minBin, maxBin, binSize, biggest),
    rms, snr, quality, minHz: requestedMin, maxHz: requestedMax
  };
}

function makeCurve(mags, minBin, maxBin, binSize, biggest) {
  const points = [];
  // Logarithmic 180-column peak-preserving spectrum representation.
  const minHz = Math.max(30, minBin * binSize), maxHz = maxBin * binSize;
  for (let i = 0; i < 180; i++) {
    const a = Math.exp(Math.log(minHz) + i / 180 * Math.log(maxHz/minHz));
    const b = Math.exp(Math.log(minHz) + (i+1) / 180 * Math.log(maxHz/minHz));
    const k0 = Math.max(minBin, Math.floor(a / binSize));
    const k1 = Math.min(maxBin, Math.max(k0, Math.ceil(b / binSize)));
    let peak = 0;
    for (let k = k0; k <= k1; k++) peak = Math.max(peak, mags[k]);
    const dbBelowMax = 20 * Math.log10((peak + EPS)/(biggest + EPS));
    points.push(Math.max(0, Math.min(1, (dbBelowMax + 52) / 52)));
  }
  return points;
}

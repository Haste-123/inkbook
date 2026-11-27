/* Inkbook lecture mode: removes the click of the Pencil hitting the glass without touching the voice.
   A tap is a spike that jumps up in under a millisecond; speech rises much more slowly. The sound is
   held back 150 ms so (1) each spike is seen a few ms before it is played and only that spike is turned
   down, to about the level of the voice around it, and (2) Pencil touch-downs reported by the page
   (which arrive a little after the sound) make the detector more sensitive right at those moments. */
class InkbookDeclick extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = sampleRate;
    this.N = Math.round(sr * 0.2); this.buf = new Float32Array(this.N); this.w = 0;
    this.D = Math.round(sr * 0.15); this.L = Math.round(sr * 0.005);
    this.env = 0.001; this.pk = 0; this.g = 1; this.hold = 0; this.holdN = Math.round(sr * 0.035); this.clamp = 1;
    this.atk = 1 - Math.exp(-1 / (0.012 * sr)); this.rel = 1 - Math.exp(-1 / (0.15 * sr));
    this.pkDec = Math.exp(-1 / (0.004 * sr)); this.gRel = 1 - Math.exp(-1 / (0.008 * sr));
    this.hints = []; this.cut = 0;
    this.port.onmessage = e => {
      if (e.data.hint != null) { this.hints.push(e.data.hint); if (this.hints.length > 40) this.hints.shift(); }
      if (e.data.stats) this.port.postMessage({ cut: this.cut });
    };
  }
  process(inputs, outputs) {
    const inp = inputs[0] && inputs[0][0], outs = outputs[0], out = outs[0]; if (!out) return true;
    const n = out.length, sr = sampleRate, N = this.N, buf = this.buf, look = this.D - this.L;
    const t0 = currentTime - look / sr, t1 = t0 + n / sr;
    const hs = this.hints.filter(h => h > t0 - 0.1 && h < t1 + 0.1);
    for (let i = 0; i < n; i++) {
      buf[this.w] = inp ? inp[i] : 0;
      const a = buf[(this.w - look + N) % N], ax = Math.abs(a), o = buf[(this.w - this.D + N) % N];
      this.w = (this.w + 1) % N;
      const t = t0 + i / sr;
      let k = 9;                                            // a spike 9x the recent level is never speech
      for (let j = 0; j < hs.length; j++) if (t > hs[j] - 0.07 && t < hs[j] + 0.025) { k = 4; break; }   // the Pencil just landed
      const lvl = Math.max(this.env, 0.0008);
      if (this.hold > 0) this.hold--;
      if (ax > k * lvl) { if (this.hold === 0) { this.clamp = 1.6 * lvl; this.cut++; } this.hold = this.holdN; }
      if (this.hold === 0) this.env += (ax > this.env ? this.atk : this.rel) * (ax - this.env);   // the click doesn't count as "level"
      this.pk = Math.max(ax, this.pk * this.pkDec);
      const gT = this.hold > 0 ? Math.min(1, this.clamp / Math.max(this.pk, 1e-9)) : 1;
      this.g = gT < this.g ? gT : this.g + (gT - this.g) * this.gRel;
      out[i] = o * this.g;
    }
    for (let c = 1; c < outs.length; c++) outs[c].set(out);
    return true;
  }
}
registerProcessor('inkbook-declick', InkbookDeclick);

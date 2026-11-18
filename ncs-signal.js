const sonoraAudioGraphs = new Set();
const sonoraAudioSamples = new WeakMap();

function sonoraAttachAnalyser(graph) {
  try {
    let entry = sonoraAudioSamples.get(graph);
    if (!entry) {
      const analyser = graph.context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.minDecibels = -84;
      analyser.maxDecibels = -15;
      analyser.smoothingTimeConstant = .36;
      entry = { analyser, spectrum: new Uint8Array(analyser.frequencyBinCount) };
      sonoraAudioSamples.set(graph, entry);
      sonoraAudioGraphs.add(new WeakRef(graph));
    }
    graph.sourceNode.connect(entry.analyser);
  } catch (error) {
    console.debug('Sonora: audio analyser unavailable', error);
  }
}

function sonoraFrequencyBand(spectrum, binWidth, low, high) {
  const first = Math.max(1, Math.ceil(low / binWidth));
  const end = Math.min(spectrum.length, Math.ceil(high / binWidth));
  if (first >= end) return 0;
  let sum = 0, peak = 0;
  for (let i = first; i < end; i++) {
    const sample = spectrum[i] / 255;
    sum += sample * sample;
    peak = Math.max(peak, sample);
  }
  return Math.max(0, .62 * peak + .38 * Math.sqrt(sum / (end - first)) - .065);
}

document.addEventListener('sonora-ncs-audio-request', () => {
  if (document.hidden || document.documentElement.dataset.sonoraWaveShape !== 'ncs') return;
  let bass = 0, middle = 0, treble = 0;
  for (const reference of sonoraAudioGraphs) {
    const graph = reference.deref();
    if (!graph || graph.context.state === 'closed') { sonoraAudioGraphs.delete(reference); continue; }
    if (graph.audioElement.paused || graph.audioElement.ended || graph.context.state !== 'running') continue;
    const { analyser, spectrum } = sonoraAudioSamples.get(graph);
    analyser.getByteFrequencyData(spectrum);
    const binWidth = graph.context.sampleRate / analyser.fftSize;
    bass = Math.max(bass, sonoraFrequencyBand(spectrum, binWidth, 35, 165));
    middle = Math.max(middle, sonoraFrequencyBand(spectrum, binWidth, 165, 2200));
    treble = Math.max(treble, sonoraFrequencyBand(spectrum, binWidth, 2200, 7200));
  }
  document.dispatchEvent(new CustomEvent('sonora-ncs-audio-levels', { detail: [bass,middle,treble].join(',') }));
});

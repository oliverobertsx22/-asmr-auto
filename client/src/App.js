import React, { useState, useEffect, useRef } from 'react';

const API = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001';

const PLATFORMS = [
  { id: 'tiktok', name: 'TikTok', color: '#69C9D0' },
  { id: 'youtube', name: 'YouTube', color: '#FF4444' },
  { id: 'instagram', name: 'Instagram', color: '#C77DFF' },
  { id: 'snapchat', name: 'Snapchat (Manual)', color: '#FFE600' },
];

const SOUNDS = [
  { id: 'rain', label: '🌧 Rain', prompt: 'Gentle rain falling on a window, soft pitter-patter, soothing and relaxing, perfect for sleep' },
  { id: 'fire', label: '🔥 Fire', prompt: 'Crackling fireplace with warm pops and hisses, cozy cabin ambience, wood burning softly' },
  { id: 'ocean', label: '🌊 Ocean', prompt: 'Ocean waves gently lapping on a sandy shore, rhythmic and calming, soft foam and distant seagulls' },
  { id: 'keyboard', label: '⌨️ Typing', prompt: 'Soft mechanical keyboard typing sounds, gentle clicks and clacks, quiet focused office atmosphere' },
  { id: 'paper', label: '📄 Paper', prompt: 'Gentle page turning and paper rustling sounds, soft library atmosphere, peaceful and quiet' },
  { id: 'forest', label: '🌿 Forest', prompt: 'Forest ambience with birds chirping, leaves rustling gently in breeze, peaceful nature soundscape' },
  { id: 'whisper', label: '🤫 Whisper', prompt: 'Soft gentle whispering, soothing bedtime voice, calm and relaxing, triggering ASMR tingles' },
  { id: 'tapping', label: '👆 Tapping', prompt: 'Gentle rhythmic finger tapping on wood and glass surfaces, satisfying ASMR tapping sounds' },
];

const KLING_PROMPTS = {
  rain: 'Close up slow motion rain drops falling on dark window glass, cinematic ambient loop, soft bokeh lights, 4K',
  fire: 'Crackling fireplace close up, warm orange flames dancing slowly, cozy dark room, cinematic loop, 4K',
  ocean: 'Slow motion ocean waves rolling onto sandy beach at golden hour, aerial drone shot, cinematic loop, 4K',
  keyboard: 'Extreme close up fingers typing on mechanical keyboard, soft studio lighting, slow motion, cinematic loop',
  paper: 'Close up slow motion hands turning pages of old book, warm lamp light, shallow depth of field, cinematic',
  forest: 'Slow motion forest sunlight filtering through green leaves, birds, peaceful nature, cinematic loop, 4K',
  whisper: 'Soft close up lips near microphone, warm studio light, shallow depth of field, cinematic, calming ASMR',
  tapping: 'Extreme close up slow motion fingers tapping gently on wood surface, warm light, cinematic ASMR loop',
};

const DURATIONS = [
  { label: '30s', val: 30, clips: 1 },
  { label: '1 min', val: 60, clips: 2 },
  { label: '3 min', val: 180, clips: 6 },
  { label: '5 min', val: 300, clips: 10 },
];

const NAV = [
  { id: 'pipeline', label: 'Pipeline', icon: '⟡' },
  { id: 'generate', label: 'Generate', icon: '✦' },
  { id: 'analytics', label: 'Analytics', icon: '∿' },
  { id: 'platforms', label: 'Platforms', icon: '⊹' },
];

// ── LOCAL AUDIO STORE ──
const AUDIO_STORE = {};

function bufferToWavBlob(buffer) {
  const ch = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
  const ab = new ArrayBuffer(44 + len * ch * 2);
  const v = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + len * ch * 2, true); ws(8, 'WAVE');
  ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  ws(36, 'data'); v.setUint32(40, len * ch * 2, true);
  let pos = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]));
    v.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7FFF, true); pos += 2;
  }
  return new Blob([ab], { type: 'audio/wav' });
}

// ── WAVEFORM ──
function Waveform({ active, color = '#C4B5FD' }) {
  const [heights, setHeights] = useState(() => Array.from({ length: 20 }, () => Math.random() * 14 + 4));
  useEffect(() => {
    if (!active) return;
    const iv = setInterval(() => setHeights(Array.from({ length: 20 }, () => Math.random() * 14 + 4)), 180);
    return () => clearInterval(iv);
  }, [active]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 24 }}>
      {heights.map((h, i) => (
        <div key={i} style={{ width: 3, height: active ? h : 4 + (i % 3) * 3, background: color, borderRadius: 2, opacity: active ? 0.85 : 0.3, transition: active ? 'height 0.18s ease' : 'none' }} />
      ))}
    </div>
  );
}

// ── GENERATE PAGE ──
function GeneratePage({ onVideoCreated }) {
  const [type, setType] = useState('rain');
  const [durVal, setDurVal] = useState(60);
  const [platforms, setPlatforms] = useState(['tiktok', 'youtube', 'instagram', 'snapchat']);
  const [step, setStep] = useState('prompt');
  const [clips, setClips] = useState([]);
  const [stitching, setStitching] = useState(false);
  const [stitchError, setStitchError] = useState(null);
  const [finalUrl, setFinalUrl] = useState(null);
  const [finalBlob, setFinalBlob] = useState(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const fileRefs = useRef([]);

  const sound = SOUNDS.find(s => s.id === type);
  const dur = DURATIONS.find(d => d.val === durVal);
  const uploaded = clips.filter(Boolean).length;
  const allUploaded = uploaded === dur.clips;

  const togglePlat = id => setPlatforms(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const copyPrompt = () => {
    navigator.clipboard?.writeText(sound.prompt).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const storeClip = async (file, i) => {
    const arrayBuffer = await file.arrayBuffer();
    const newClips = [...clips];
    newClips[i] = { name: file.name, arrayBuffer };
    setClips(newClips);
  };

  const stitch = async () => {
    setStitching(true); setStitchError(null);
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = [];
      for (const clip of clips) {
        const buf = clip.arrayBuffer.slice(0);
        decoded.push(await ctx.decodeAudioData(buf));
      }
      const sr = decoded[0].sampleRate, ch = decoded[0].numberOfChannels;
      const total = decoded.reduce((s, b) => s + b.length, 0);
      const merged = ctx.createBuffer(ch, total, sr);
      let off = 0;
      for (const b of decoded) {
        for (let c = 0; c < ch; c++) merged.getChannelData(c).set(b.getChannelData(c), off);
        off += b.length;
      }
      const blob = bufferToWavBlob(merged);
      const url = URL.createObjectURL(blob);
      setFinalBlob(blob); setFinalUrl(url); setStep('done');
    } catch (e) { setStitchError('Stitching failed: ' + e.message); }
    finally { setStitching(false); }
  };

  const addToPipeline = async () => {
    setGenerating(true); setGenError(null);
    try {
      const title = `${sound.label.split(' ').slice(1).join(' ')} · ${dur.label}`;
      const mins = Math.floor(durVal / 60), secs = durVal % 60;
      const duration = `${mins}:${String(secs).padStart(2, '0')}`;

      // Save video record to backend
      const resp = await fetch(`${API}/api/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type, duration, platforms, stage: 'ready' }),
      });
      const video = await resp.json();

      // Upload audio to backend storage
      if (finalBlob) {
        const formData = new FormData();
        formData.append('audio', finalBlob, `asmr-${type}.wav`);
        const uploadResp = await fetch(`${API}/api/upload-audio`, { method: 'POST', body: formData });
        const uploadData = await uploadResp.json();
        if (uploadData.url) {
          await fetch(`${API}/api/videos/${video.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_url: uploadData.url }),
          });
          video.audio_url = uploadData.url;
        }
      }

      // Keep audio in local store too for immediate playback
      if (finalBlob) AUDIO_STORE[video.id] = finalBlob;

      onVideoCreated(video);
      setStep('added');
    } catch (e) {
      setGenError(e.message);
    } finally { setGenerating(false); }
  };

  const s = { label: (t) => ({ fontSize: 11, color: '#6B7499', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }) };

  if (step === 'added') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 16 }}>
      <div style={{ fontSize: 48 }}>✅</div>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: '#86EFAC' }}>Added to Pipeline!</div>
      <div style={{ fontSize: 14, color: '#6B7499' }}>Your audio is ready. Generate the matching video from the Pipeline.</div>
      <button onClick={() => { setStep('prompt'); setClips([]); setFinalUrl(null); setFinalBlob(null); }}
        style={{ marginTop: 8, padding: '10px 24px', background: 'linear-gradient(135deg,#7C6FFF,#C4B5FD)', border: 'none', borderRadius: 8, color: '#0A0E1A', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        Generate Another
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: '#E8E6F0', marginBottom: 24 }}>Generate ASMR Audio</div>

      {/* Step indicators */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {['1. Choose & copy', '2. Upload clips', '3. Done'].map((s, i) => {
          const active = ['prompt', 'upload', 'done'][i] === step || (stitching && i === 1);
          return <div key={i} style={{ flex: 1, fontSize: 10, padding: '5px 6px', borderRadius: 6, textAlign: 'center', fontWeight: 600, background: active ? '#C4B5FD22' : '#1E2640', color: active ? '#C4B5FD' : '#3D4568', border: `1px solid ${active ? '#C4B5FD44' : 'transparent'}` }}>{s}</div>;
        })}
      </div>

      {/* Sound type */}
      <div style={{ marginBottom: 18 }}>
        <span style={{ fontSize: 11, color: '#6B7499', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>ASMR Type</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {SOUNDS.map(s => (
            <button key={s.id} onClick={() => { setType(s.id); setClips([]); setStep('prompt'); }} style={{ padding: '6px 11px', borderRadius: 8, fontSize: 12, background: type === s.id ? '#C4B5FD' : '#1E2640', color: type === s.id ? '#0A0E1A' : '#A0A8C8', border: 'none', fontWeight: type === s.id ? 700 : 400, cursor: 'pointer' }}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div style={{ marginBottom: 18 }}>
        <span style={{ fontSize: 11, color: '#6B7499', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>Duration</span>
        <div style={{ display: 'flex', gap: 7 }}>
          {DURATIONS.map(d => (
            <button key={d.val} onClick={() => { setDurVal(d.val); setClips([]); }} style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11, background: durVal === d.val ? '#C4B5FD' : '#1E2640', color: durVal === d.val ? '#0A0E1A' : '#A0A8C8', border: 'none', fontWeight: durVal === d.val ? 700 : 400, cursor: 'pointer' }}>{d.label}</button>
          ))}
        </div>
      </div>

      {/* Platforms */}
      <div style={{ marginBottom: 22 }}>
        <span style={{ fontSize: 11, color: '#6B7499', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>Post To</span>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {PLATFORMS.map(p => {
            const sel = platforms.includes(p.id);
            return <button key={p.id} onClick={() => togglePlat(p.id)} style={{ padding: '5px 11px', borderRadius: 8, fontSize: 11, background: sel ? p.color + '22' : '#1E2640', color: sel ? p.color : '#6B7499', border: `1px solid ${sel ? p.color + '66' : '#252D4A'}`, fontWeight: 600, cursor: 'pointer' }}>{p.name}</button>;
          })}
        </div>
      </div>

      {/* Step: Prompt */}
      {step === 'prompt' && (
        <div>
          <div style={{ background: '#0D1122', border: '1px solid #252D4A', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: '#6B7499', marginBottom: 6, display: 'block' }}>PASTE THIS INTO ELEVENLABS SOUND EFFECTS</span>
            <div style={{ fontSize: 12, color: '#C4B5FD', lineHeight: 1.5, fontStyle: 'italic' }}>"{sound.prompt}"</div>
          </div>
          {dur.clips > 1 && (
            <div style={{ background: '#7C6FFF22', border: '1px solid #7C6FFF44', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#C4B5FD', lineHeight: 1.6 }}>
              ⚡ You need <strong>{dur.clips} clips × 30s</strong> to make {dur.label}. Generate each on ElevenLabs, then upload them all here.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={copyPrompt} style={{ flex: 1, padding: '10px 0', background: copied ? '#86EFAC' : '#C4B5FD', color: '#0A0E1A', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{copied ? '✓ Copied!' : 'Copy Prompt'}</button>
            <a href="https://elevenlabs.io/sound-effects" target="_blank" rel="noreferrer" style={{ flex: 1, padding: '10px 0', background: '#1E2640', color: '#C4B5FD', border: '1px solid #C4B5FD44', borderRadius: 8, fontSize: 13, fontWeight: 600, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Open ElevenLabs ↗</a>
          </div>
          <button onClick={() => setStep('upload')} style={{ width: '100%', padding: '10px 0', background: '#1E2640', color: '#86EFAC', border: '1px solid #86EFAC44', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>I have the file(s) →</button>
        </div>
      )}

      {/* Step: Upload */}
      {step === 'upload' && (
        <div>
          <div style={{ fontSize: 12, color: '#6B7499', marginBottom: 6 }}>{uploaded} of {dur.clips} clips uploaded</div>
          <div style={{ height: 4, background: '#252D4A', borderRadius: 2, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(uploaded / dur.clips * 100)}%`, height: '100%', background: 'linear-gradient(90deg,#7C6FFF,#C4B5FD)', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
          {Array.from({ length: dur.clips }, (_, i) => (
            <div key={i} onClick={() => fileRefs.current[i]?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) storeClip(f, i); }}
              style={{ background: '#0D1122', border: `1px solid ${clips[i] ? '#86EFAC44' : '#252D4A'}`, borderRadius: 8, padding: '10px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <div style={{ fontSize: 16 }}>{clips[i] ? '✅' : '📁'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: clips[i] ? '#86EFAC' : '#6B7499' }}>Clip {i + 1} of {dur.clips} — 30s</div>
                <div style={{ fontSize: 11, color: '#3D4568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clips[i] ? clips[i].name : 'Click or drag mp3 here'}</div>
              </div>
              <input ref={el => fileRefs.current[i] = el} type="file" accept="audio/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) storeClip(f, i); }} />
            </div>
          ))}
          {stitchError && <div style={{ padding: '8px 12px', background: '#2A1520', borderRadius: 8, fontSize: 12, color: '#FF8080', marginTop: 8 }}>⚠ {stitchError}</div>}
          <button onClick={allUploaded && !stitching ? stitch : undefined} style={{ width: '100%', marginTop: 12, padding: '12px 0', background: allUploaded && !stitching ? 'linear-gradient(135deg,#7C6FFF,#C4B5FD)' : '#1E2640', color: allUploaded ? '#E8E6F0' : '#3D4568', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: allUploaded && !stitching ? 'pointer' : 'not-allowed' }}>
            {stitching ? '⚡ Stitching clips...' : allUploaded ? `✨ Stitch into ${dur.label} track` : `Upload all ${dur.clips} clips to continue`}
          </button>
          <button onClick={() => setStep('prompt')} style={{ width: '100%', padding: '8px 0', background: 'transparent', color: '#6B7499', border: 'none', fontSize: 12, cursor: 'pointer', marginTop: 6 }}>← Back</button>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && finalUrl && (
        <div>
          <div style={{ background: '#0D1122', borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#86EFAC', marginBottom: 10, fontWeight: 600 }}>✓ {dur.label} track ready — {dur.clips} clips stitched!</div>
            <Waveform active={false} color="#86EFAC" />
            <audio controls src={finalUrl} style={{ width: '100%', marginTop: 8, accentColor: '#C4B5FD' }} />
            <a href={finalUrl} download={`asmr-${type}.wav`} style={{ display: 'inline-block', marginTop: 8, fontSize: 11, color: '#C4B5FD' }}>⬇ Download audio</a>
          </div>
          {genError && <div style={{ padding: '8px 12px', background: '#2A1520', borderRadius: 8, fontSize: 12, color: '#FF8080', marginBottom: 12 }}>⚠ {genError}</div>}
          <button onClick={addToPipeline} disabled={generating} style={{ width: '100%', padding: '12px 0', background: generating ? '#252D4A' : '#86EFAC', color: '#0A0E1A', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: generating ? 'not-allowed' : 'pointer' }}>
            {generating ? 'Saving...' : 'Add to Pipeline ✓'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── KLING VIDEO PANEL ──
function KlingPanel({ video }) {
  const [status, setStatus] = useState('idle');
  const [videoUrl, setVideoUrl] = useState(video.video_url || null);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (video.video_url) { setVideoUrl(video.video_url); setStatus('done'); }
  }, [video.video_url]);

  useEffect(() => {
    if (['generating', 'queue', 'submitting'].includes(status)) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      if (status !== 'done') setElapsed(0);
    }
    return () => clearInterval(timerRef.current);
  }, [status]);

  const generate = async () => {
    setStatus('submitting'); setError(null); setElapsed(0);
    try {
      const prompt = KLING_PROMPTS[video.type] || KLING_PROMPTS.rain;
      setStatus('queue');
      const resp = await fetch(`${API}/api/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, type: video.type, videoId: video.id }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Video generation failed');
      setStatus('generating');
      startPolling(data.taskId);
    } catch (e) { setError(e.message); setStatus('error'); }
  };

  const startPolling = (taskId) => {
    pollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${API}/api/video-status/${taskId}`);
        const data = await resp.json();
        if (data.status === 'succeed' && data.videoUrl) {
          clearInterval(pollRef.current);
          setVideoUrl(data.videoUrl);
          setStatus('done');
          // Update video record
          await fetch(`${API}/api/videos/${video.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_url: data.videoUrl }),
          });
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current);
          setError('Kling generation failed'); setStatus('error');
        }
      } catch {}
    }, 10000);
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  if (status === 'idle') return (
    <button onClick={generate} style={{ width: '100%', marginTop: 8, padding: '8px 0', background: '#69C9D022', color: '#69C9D0', border: '1px solid #69C9D044', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
      🎬 Generate Video with Kling AI
    </button>
  );

  if (status === 'done') return (
    <div style={{ marginTop: 10, background: '#0D1122', border: '1px solid #86EFAC44', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: '#86EFAC', fontWeight: 700, marginBottom: 8 }}>✅ Video ready!</div>
      {videoUrl
        ? <a href={videoUrl} target="_blank" rel="noreferrer" style={{ display: 'block', padding: '8px 0', background: '#69C9D0', color: '#0A0E1A', borderRadius: 7, fontSize: 12, fontWeight: 700, textAlign: 'center' }}>⬇ Download Video</a>
        : <div style={{ fontSize: 11, color: '#6B7499' }}>Check your Kling dashboard for the video</div>
      }
      <button onClick={() => { setStatus('idle'); setVideoUrl(null); }} style={{ width: '100%', marginTop: 6, padding: '6px 0', background: 'transparent', color: '#6B7499', border: 'none', fontSize: 11, cursor: 'pointer' }}>↺ Regenerate</button>
    </div>
  );

  if (status === 'error') return (
    <div style={{ marginTop: 10, background: '#2A1520', border: '1px solid #FF808044', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: '#FF8080', marginBottom: 8, wordBreak: 'break-word' }}>⚠ {error}</div>
      <button onClick={() => { setStatus('idle'); setError(null); }} style={{ width: '100%', padding: '7px 0', background: '#1E2640', color: '#69C9D0', border: '1px solid #69C9D044', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>↺ Try Again</button>
    </div>
  );

  const steps = [
    { id: 'submitting', label: 'Submitting to Kling' },
    { id: 'queue', label: 'In Kling queue' },
    { id: 'generating', label: 'Generating video (2–5 min)' },
  ];
  const activeIdx = steps.findIndex(s => s.id === status);

  return (
    <div style={{ marginTop: 10, background: '#0D1122', border: '1px solid #69C9D044', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: '#69C9D0', fontWeight: 600, marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
        <span>🎬 Generating video...</span>
        {elapsed > 0 && <span style={{ color: '#3D4568' }}>{fmt(elapsed)}</span>}
      </div>
      {steps.map((s, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        const color = done ? '#86EFAC' : active ? '#69C9D0' : '#3D4568';
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: color + '22', border: `1px solid ${color}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color }}>
              {done ? '✓' : active ? '●' : '○'}
            </div>
            <div style={{ fontSize: 12, color, fontWeight: active ? 600 : 400 }}>{s.label}</div>
            {active && <div style={{ marginLeft: 'auto', fontSize: 10, color: '#3D4568' }}>{fmt(elapsed)}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── VIDEO CARD ──
function VideoCard({ video }) {
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef(null);
  const srcRef = useRef(null);

  const play = async () => {
    if (playing) {
      try { srcRef.current?.stop(); } catch {}
      try { ctxRef.current?.close(); } catch {}
      setPlaying(false); return;
    }
    const blob = AUDIO_STORE[video.id];
    const url = blob ? URL.createObjectURL(blob) : video.audio_url;
    if (!url) { alert('No audio available for this track.'); return; }

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctxRef.current = ctx;
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const src = ctx.createBufferSource();
    srcRef.current = src;
    src.buffer = decoded;
    src.connect(ctx.destination);
    src.start(0);
    setPlaying(true);
    src.onended = () => { setPlaying(false); ctx.close(); };
  };

  const tags = video.platforms?.map(pid => {
    const p = PLATFORMS.find(pl => pl.id === pid);
    return p ? <span key={pid} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: p.color + '22', color: p.color, fontWeight: 600 }}>{p.name.replace(' (Manual)', '')}</span> : null;
  });

  const hasAudio = !!(AUDIO_STORE[video.id] || video.audio_url);

  return (
    <div style={{ background: '#161B30', border: '1px solid #252D4A', borderRadius: 12, padding: '14px 16px', marginBottom: 10, transition: 'border-color 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#C4B5FD'}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#252D4A'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#E8E6F0', flex: 1, paddingRight: 8 }}>{video.title}</div>
        <div style={{ fontSize: 11, color: '#6B7499' }}>{video.duration}</div>
      </div>
      <Waveform active={playing} color={playing ? '#86EFAC' : '#C4B5FD'} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={play} style={{ flex: 1, padding: '7px 0', background: hasAudio ? playing ? '#86EFAC' : 'linear-gradient(135deg,#7C6FFF,#C4B5FD)' : '#1E2640', color: hasAudio ? '#0A0E1A' : '#3D4568', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: hasAudio ? 'pointer' : 'not-allowed' }}>
          {playing ? '⏸ Stop' : '▶ Play'}
        </button>
        {video.audio_url && (
          <a href={video.audio_url} download style={{ flex: 1, padding: '7px 0', background: '#C4B5FD', color: '#0A0E1A', borderRadius: 7, fontSize: 12, fontWeight: 700, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⬇ Audio</a>
        )}
      </div>
      <KlingPanel video={video} />
      <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>{tags}</div>
    </div>
  );
}

// ── MAIN APP ──
export default function App() {
  const [nav, setNav] = useState('pipeline');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serverOk, setServerOk] = useState(null);

  useEffect(() => {
    // Check server health
    fetch(`${API}/api/health`)
      .then(r => r.json())
      .then(() => { setServerOk(true); loadVideos(); })
      .catch(() => setServerOk(false))
      .finally(() => setLoading(false));
  }, []);

  const loadVideos = async () => {
    try {
      const resp = await fetch(`${API}/api/videos`);
      const data = await resp.json();
      setVideos(Array.isArray(data) ? data : []);
    } catch {}
  };

  const handleVideoCreated = (video) => {
    setVideos(prev => [video, ...prev]);
    setNav('pipeline');
  };

  if (loading) return (
    <div style={{ background: '#0A0E1A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C4B5FD', fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700 }}>
      Loading ASMR.AUTO...
    </div>
  );

  if (serverOk === false) return (
    <div style={{ background: '#0A0E1A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 40 }}>
      <div style={{ fontSize: 32 }}>⚠️</div>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: '#FF8080' }}>Server not connected</div>
      <div style={{ fontSize: 14, color: '#6B7499', textAlign: 'center', maxWidth: 400, lineHeight: 1.6 }}>
        The backend server isn't running. Make sure you've deployed the server to Render.com and set the API URL correctly.
      </div>
      <button onClick={() => window.location.reload()} style={{ padding: '10px 24px', background: '#C4B5FD', color: '#0A0E1A', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Retry</button>
    </div>
  );

  const stages = [
    { id: 'ready', label: 'Ready to Post', color: '#C4B5FD' },
    { id: 'scheduled', label: 'Scheduled', color: '#86EFAC' },
    { id: 'posted', label: 'Posted', color: '#6EE7B7' },
  ];

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", background: '#0A0E1A', minHeight: '100vh', color: '#E8E6F0', display: 'flex' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0A0E1A; }
        ::-webkit-scrollbar-thumb { background: #252D4A; border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        audio { accent-color: #C4B5FD; width: 100%; }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: 200, flexShrink: 0, background: '#0D1122', borderRight: '1px solid #1A2035', padding: '24px 16px', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, color: '#C4B5FD', letterSpacing: '0.04em' }}>ASMR.AUTO</div>
          <div style={{ fontSize: 10, color: '#3D4568', marginTop: 2, letterSpacing: '0.06em' }}>CONTENT PIPELINE</div>
        </div>
        <nav style={{ flex: 1 }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setNav(n.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', borderRadius: 8, marginBottom: 2, background: nav === n.id ? '#1E2640' : 'transparent', color: nav === n.id ? '#C4B5FD' : '#6B7499', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: nav === n.id ? 600 : 400, textAlign: 'left' }}>
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div style={{ borderTop: '1px solid #1A2035', paddingTop: 14 }}>
          <div style={{ fontSize: 11, color: '#3D4568', marginBottom: 6 }}>STATUS</div>
          <div style={{ fontSize: 11, color: serverOk ? '#86EFAC' : '#FF8080' }}>{serverOk ? '✓ Server online' : '✗ Server offline'}</div>
          <div style={{ fontSize: 11, color: '#86EFAC', marginTop: 3 }}>✓ {videos.length} videos</div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: 60, borderBottom: '1px solid #1A2035', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', flexShrink: 0 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 700, color: '#E8E6F0' }}>{NAV.find(n => n.id === nav)?.label}</div>
          <button onClick={() => setNav('generate')} style={{ padding: '8px 18px', background: 'linear-gradient(135deg,#7C6FFF,#C4B5FD)', border: 'none', borderRadius: 8, color: '#0A0E1A', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Generate Audio</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>

          {/* PIPELINE */}
          {nav === 'pipeline' && (
            videos.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 14 }}>
                <div style={{ fontSize: 36, opacity: 0.2 }}>⟡</div>
                <div style={{ fontSize: 14, color: '#3D4568' }}>No videos yet — generate your first one</div>
                <button onClick={() => setNav('generate')} style={{ marginTop: 4, padding: '10px 22px', background: 'linear-gradient(135deg,#7C6FFF,#C4B5FD)', color: '#0A0E1A', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Generate Audio</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8 }}>
                {stages.map(st => (
                  <div key={st.id} style={{ minWidth: 260, flex: '0 0 260px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: st.color }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: st.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{st.label}</span>
                      <span style={{ fontSize: 11, color: '#6B7499', marginLeft: 'auto' }}>{videos.filter(v => v.stage === st.id).length}</span>
                    </div>
                    {videos.filter(v => v.stage === st.id).length === 0
                      ? <div style={{ fontSize: 12, color: '#3D4568', padding: '12px 0', textAlign: 'center' }}>Empty</div>
                      : videos.filter(v => v.stage === st.id).map(v => <VideoCard key={v.id} video={v} />)
                    }
                  </div>
                ))}
              </div>
            )
          )}

          {/* GENERATE */}
          {nav === 'generate' && <GeneratePage onVideoCreated={handleVideoCreated} />}

          {/* ANALYTICS */}
          {nav === 'analytics' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 16, marginBottom: 28 }}>
                {[
                  { l: 'Total Views', v: '0', s: 'Start posting!', c: '#86EFAC' },
                  { l: 'Videos Generated', v: String(videos.length), s: 'In your pipeline', c: '#C4B5FD' },
                  { l: 'Monthly Cost', v: '$123', s: 'ElevenLabs + Kling + Render', c: '#69C9D0' },
                  { l: 'Break-even', v: '55K', s: 'Views/month across 4 platforms', c: '#FFE600' },
                ].map(x => (
                  <div key={x.l} style={{ background: '#161B30', border: '1px solid #252D4A', borderRadius: 12, padding: '16px 18px' }}>
                    <div style={{ fontSize: 11, color: '#6B7499', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{x.l}</div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 800, color: '#E8E6F0' }}>{x.v}</div>
                    <div style={{ fontSize: 11, color: x.c, marginTop: 4 }}>{x.s}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: '#161B30', border: '1px solid #252D4A', borderRadius: 12, padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#E8E6F0', marginBottom: 16 }}>Platform Earnings Potential</div>
                {[{ n: 'YouTube', r: '$3–5', c: '#FF4444' }, { n: 'Snapchat', r: '$1–5', c: '#FFE600' }, { n: 'TikTok', r: '$0.40–0.80', c: '#69C9D0' }, { n: 'Instagram', r: '$0.10–3', c: '#C77DFF' }].map(p => (
                  <div key={p.n} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: p.c, fontWeight: 600 }}>{p.n}</span>
                    <span style={{ fontSize: 12, color: '#6B7499' }}>{p.r} per 1K views</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PLATFORMS */}
          {nav === 'platforms' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
              {[
                { ...PLATFORMS[0], note: 'Needs TikTok Developer account', connected: false },
                { ...PLATFORMS[1], note: 'Needs YouTube Data API v3', connected: false },
                { ...PLATFORMS[2], note: 'Needs Meta Developer account', connected: false },
                { ...PLATFORMS[3], note: 'Manual posting — download from Pipeline', connected: true },
              ].map(p => (
                <div key={p.id} style={{ background: '#161B30', border: `1px solid ${p.connected ? p.color + '44' : '#252D4A'}`, borderRadius: 14, padding: '22px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: p.connected ? p.color : '#6B7499' }}>{p.name}</div>
                    <div style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, fontWeight: 700, background: p.connected ? p.color + '22' : '#252D4A', color: p.connected ? p.color : '#6B7499' }}>{p.connected ? 'READY' : 'PENDING'}</div>
                  </div>
                  <div style={{ fontSize: 11, color: '#3D4568', marginBottom: 14 }}>{p.note}</div>
                  {p.connected
                    ? <div style={{ fontSize: 12, color: p.color, fontWeight: 600 }}>✓ Download from Pipeline</div>
                    : <button style={{ width: '100%', padding: '8px 0', background: p.color, color: '#0A0E1A', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Connect →</button>
                  }
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { Presentation, Video, Send, ImagePlus, Download, Volume2, Wand2, X, Sparkles, History, Trash2, Pencil } from 'lucide-react';

type Mode = 'ppt' | 'video';
type ImageChoice = 'mine' | 'ai' | 'both' | 'none';
type Msg = { role: 'user' | 'assistant'; content: string };
type Slide = { title: string; bullets: string[]; narration: string; imagePrompt: string; image?: string; aiUrl?: string };

type TextSource = 'ai' | 'mine';
type SavedItem = { id: string; mode: Mode; title: string; created_at: string };

async function shrink(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 800 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

const GREETING = 'أهلاً بيك! قولي فكرة الدرس اللي عايز تحضّره (قصة، آية، موضوع...) وأنا أساعدك خطوة خطوة.';

async function callAI(kind: 'chat' | 'plan', mode: Mode, messages: Msg[]): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` },
    body: JSON.stringify({ kind, mode, messages }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'تعذر الاتصال بالذكاء الاصطناعي');
  return j.text as string;
}

const aiImageUrl = (prompt: string, i: number) =>
  `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + ', soft colorful illustration for children, no text')}?width=1024&height=576&nologo=true&seed=${i + 7}`;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1280 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = fr.result as string;
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// الخدمة المجانية بتسمح بطلب كل 15 ثانية تقريبًا، فبنجيب الصور واحدة واحدة ونتأكد إنها صورة فعلًا
async function fetchAiImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    const objUrl = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = bad;
      im.src = objUrl;
    });
    URL.revokeObjectURL(objUrl);
    const k = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  } catch {
    return null;
  }
}

async function toDataUrl(src?: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  try {
    const blob = await (await fetch(src)).blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function speak(text: string, voiceName = '', rate = 1) {
  if (!('speechSynthesis' in window)) return toast('error', 'المتصفح لا يدعم القراءة بالصوت');
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ar-EG';
  u.rate = rate;
  const v = window.speechSynthesis.getVoices().find((x) => x.name === voiceName);
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',').pop() || '');
    fr.onerror = () => resolve('');
    fr.readAsDataURL(b);
  });
}

async function exportPptx(title: string, slides: Slide[], audios?: (Blob | null)[]) {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  for (const sl of slides) {
    const s = pptx.addSlide();
    s.background = { color: '161616' };
    const img = await toDataUrl(sl.image);
    s.addText(sl.title, { x: 0.4, y: 0.25, w: 9.2, h: 0.9, fontSize: 30, bold: true, color: 'D4AF37', align: 'right', rtlMode: true, fontFace: 'Arial' });
    if (img) s.addImage({ data: img, x: 0.4, y: 1.3, w: 4.4, h: 2.5, sizing: { type: 'cover', w: 4.4, h: 2.5 } });
    s.addText(
      sl.bullets.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
      { x: img ? 5.0 : 0.6, y: 1.3, w: img ? 4.6 : 8.8, h: 3.8, fontSize: 20, color: 'F5E6C8', align: 'right', valign: 'top', rtlMode: true, fontFace: 'Arial' },
    );
    s.addNotes(sl.narration);
    const au = audios?.[slides.indexOf(sl)];
    if (au) {
      const b64 = await blobToBase64(au);
      if (b64) {
        try {
          // المكتبة بتطلب هيدر base64 قبل البيانات
          s.addMedia({ type: 'audio', data: `audio/wav;base64,${b64}`, extn: 'wav', x: 9.2, y: 0.2, w: 0.5, h: 0.5 });
        } catch {
          // لو الصوت فشل في شريحة، نكمّل من غيره
        }
      }
    }
  }
  await pptx.writeFile({ fileName: `${title || 'تحضير'}.pptx` });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function drawSlide(ctx: CanvasRenderingContext2D, sl: Slide, img: HTMLImageElement | null, fade: number, p: number) {
  const W = 1280, H = 720;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#121212';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = fade;
  if (img) {
    const r = Math.max(W / img.width, H / img.height) * (1 + 0.06 * p);
    ctx.drawImage(img, (W - img.width * r) / 2, (H - img.height * r) / 2, img.width * r, img.height * r);
  }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0.65)');
  g.addColorStop(0.45, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#E8C547';
  ctx.font = 'bold 54px Arial, sans-serif';
  ctx.fillText(sl.title, W - 60, 90);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '36px Arial, sans-serif';
  const lines = wrapLines(ctx, sl.narration, W - 120);
  const top = H - 50 - lines.length * 50;
  lines.forEach((l, i) => ctx.fillText(l, W - 60, top + i * 50 + 36));
  ctx.globalAlpha = 1;
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` };
}

async function fetchTts(text: string, voice: string, style: string): Promise<Blob> {
  for (let t = 0; t < 3; t++) {
    const res = await fetch('/api/tts', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ text, voice, style }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.audio) {
      const bin = atob(j.audio);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: j.mime || 'audio/wav' });
    }
    if (res.status === 429 || res.status === 503) { await sleep(8000 * (t + 1)); continue; }
    throw new Error(j.error || 'تعذر توليد الصوت');
  }
  throw new Error('خدمة الصوت مشغولة. جرّب بعد شوية.');
}

async function exportVideo(title: string, slides: Slide[], audios: (Blob | null)[], onProgress: (n: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;
  const imgs = await Promise.all(slides.map(async (sl) => {
    const d = await toDataUrl(sl.image);
    if (!d) return null;
    return new Promise<HTMLImageElement | null>((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = d;
    });
  }));
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const actx = new AC();
  await actx.resume();
  const dest = actx.createMediaStreamDestination();
  const buffers = await Promise.all(audios.map(async (b) => {
    if (!b) return null;
    try { return await actx.decodeAudioData(await b.arrayBuffer()); } catch { return null; }
  }));
  const stream = canvas.captureStream(30);
  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('المتصفح لا يدعم تسجيل الفيديو');
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>((resolve) => { rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })); });
  rec.start();
  for (let i = 0; i < slides.length; i++) {
    let dur = Math.max(5000, slides[i].narration.split(/\s+/).length * 450);
    const buf = buffers[i];
    if (buf) {
      const src = actx.createBufferSource();
      src.buffer = buf;
      src.connect(dest);
      src.start();
      dur = Math.max(4000, buf.duration * 1000 + 1000);
    }
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = performance.now() - start;
        drawSlide(ctx, slides[i], imgs[i], Math.min(1, t / 600), Math.min(1, t / dur));
        if (t < dur) requestAnimationFrame(tick); else resolve();
      };
      tick();
    });
    onProgress(i + 1);
  }
  rec.stop();
  const blob = await done;
  await actx.close();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${title || 'فيديو'}.webm`;
  a.click();
}

export default function LessonPrep() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [choice, setChoice] = useState<ImageChoice | null>(null);
  const [mine, setMine] = useState<string[]>([]);
  const [busy, setBusy] = useState<'chat' | 'plan' | 'export' | null>(null);
  const [plan, setPlan] = useState<{ title: string; slides: Slide[] } | null>(null);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<'work' | 'old'>('work');
  const savedRef = useRef<string | null>(null);
  const queueRef = useRef(0);
  const [imgLoading, setImgLoading] = useState(false);
  const [textSource, setTextSource] = useState<TextSource | null>(null);
  const [myText, setMyText] = useState('');
  const [apiVoices, setApiVoices] = useState<{ id: string; label: string }[]>([]);
  const [voiceId, setVoiceId] = useState('');
  const [withAudio, setWithAudio] = useState(false);
  const [exportPhase, setExportPhase] = useState<'audio' | 'video'>('audio');
  const [audioBusy, setAudioBusy] = useState<number | null>(null);
  const audioCache = useRef(new Map<string, Blob>());
  const curAudio = useRef<HTMLAudioElement | null>(null);
  const [rate, setRate] = useState(1);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ title: string; bullets: string; narration: string } | null>(null);
  const planRef = useRef<{ title: string; slides: Slide[] } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/voices', { headers: await authHeaders() });
        const j = await res.json();
        if (Array.isArray(j.voices) && j.voices.length) {
          setApiVoices(j.voices);
          setVoiceId(j.voices[0].id);
        }
      } catch {
        // لو القايمة فشلت هنقرأ بصوت المتصفح
      }
    })();
  }, []);
  const [oldList, setOldList] = useState<SavedItem[]>([]);
  const [loadingOld, setLoadingOld] = useState(false);

  const reset = () => { setTextSource(null); setMyText(''); setEditIdx(null); setDraft(null); setMode(null); setMessages([]); setPlan(null); setChoice(null); setMine([]); savedRef.current = null; queueRef.current++; setImgLoading(false); };

  const showOld = async () => {
    setView('old');
    setLoadingOld(true);
    const { data, error } = await supabase.from('lesson_preps').select('id, mode, title, created_at').order('created_at', { ascending: false });
    if (error) toast('error', 'تعذر تحميل التحضيرات القديمة');
    setOldList((data as SavedItem[]) || []);
    setLoadingOld(false);
  };

  const openOld = async (id: string) => {
    const { data, error } = await supabase.from('lesson_preps').select('*').eq('id', id).single();
    if (error || !data) return toast('error', 'تعذر فتح التحضير');
    const slides = (data.slides || []) as Slide[];
    setMode(data.mode as Mode);
    setMessages((data.messages || []) as Msg[]);
    setChoice((data.choice as ImageChoice) || null);
    setMine(Array.from(new Set(slides.map((x) => x.image || '').filter((x) => x.startsWith('data:')))));
    setPlan({ title: data.title, slides });
    savedRef.current = data.id;
    setView('work');
    if (slides.some((x) => x.aiUrl && !x.image)) void runQueue(data.title, slides);
  };

  const deleteOld = async (id: string) => {
    if (!window.confirm('تحذف التحضير ده نهائيًا؟')) return;
    const { error } = await supabase.from('lesson_preps').delete().eq('id', id);
    if (error) return toast('error', 'تعذر الحذف');
    setOldList((l) => l.filter((x) => x.id !== id));
    if (savedRef.current === id) savedRef.current = null;
  };

  const persist = async (title: string, slides: Slide[], meta?: { choice: ImageChoice | null; messages: Msg[] }) => {
    if (!mode) return;
    const stored = await Promise.all(slides.map(async (x) => ({ ...x, image: x.image?.startsWith('data:') ? await shrink(x.image) : x.image })));
    const payload = { mode, title, choice: meta?.choice ?? choice, messages: meta?.messages ?? messages, slides: stored, updated_at: new Date().toISOString() };
    if (savedRef.current) {
      const { error } = await supabase.from('lesson_preps').update(payload).eq('id', savedRef.current);
      if (error) toast('error', 'تعذر حفظ التحضير');
    } else {
      const { data, error } = await supabase.from('lesson_preps').insert(payload).select('id').single();
      if (error) toast('error', 'تعذر حفظ التحضير في القايمة القديمة');
      else if (data) savedRef.current = data.id;
    }
  };

  // توليد صور الذكاء الاصطناعي واحدة واحدة (بتظهر تدريجيًا وبتتحفظ مع التحضير)
  const runQueue = async (title: string, slidesIn: Slide[], meta?: { choice: ImageChoice | null; messages: Msg[] }) => {
    const run = ++queueRef.current;
    setImgLoading(true);
    const working = [...slidesIn];
    let first = true;
    for (let i = 0; i < working.length; i++) {
      const sl = working[i];
      if (sl.image || !sl.aiUrl) continue;
      if (!first) await sleep(16000);
      first = false;
      let data: string | null = null;
      for (let t = 0; t < 3 && !data; t++) {
        if (queueRef.current !== run) return;
        data = await fetchAiImage(sl.aiUrl);
        if (!data) await sleep(16000);
      }
      if (queueRef.current !== run) return;
      working[i] = { ...sl, image: data || undefined };
      setPlan((pl) => (pl ? { ...pl, slides: pl.slides.map((x, k) => (k === i ? { ...x, image: data || undefined } : x)) } : pl));
    }
    if (queueRef.current === run) {
      setImgLoading(false);
      const cur = planRef.current?.slides || working;
      void persist(planRef.current?.title || title, cur.map((x, k) => ({ ...x, image: x.image ?? working[k]?.image })), meta);
    }
  };

  const oldButton = (
    <button onClick={view === 'old' ? () => setView('work') : showOld} className="btn-outline-gold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shrink-0">
      <History size={14} /> {view === 'old' ? 'رجوع' : 'التحضيرات القديمة'}
    </button>
  );

  if (view === 'old') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold gold-text">التحضيرات القديمة</h3>
          {oldButton}
        </div>
        {loadingOld && <p className="text-sm text-gray-400">جاري التحميل...</p>}
        {!loadingOld && oldList.length === 0 && <p className="text-center text-gray-400 py-6">لسه معملتش أي تحضير.</p>}
        {oldList.map((x) => (
          <div key={x.id} className="card-dark p-3 flex items-center justify-between gap-2">
            <button onClick={() => openOld(x.id)} className="text-right min-w-0 flex-1">
              <p className="text-sm font-semibold text-gold-300 truncate">{x.title || 'بدون عنوان'}</p>
              <p className="text-xs text-gray-400">{x.mode === 'ppt' ? 'بوربوينت' : 'فيديو'} &middot; {new Date(x.created_at).toLocaleDateString('ar-EG')}</p>
            </button>
            <button onClick={() => deleteOld(x.id)} title="حذف" className="text-red-400 hover:bg-red-950/30 p-2 rounded-lg" aria-label="حذف"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    );
  }

  if (!mode) {
    const pick = (m: Mode, Icon: typeof Presentation, label: string, hint: string) => (
      <button onClick={() => setMode(m)} className="card-dark p-6 flex flex-col items-center gap-2 hover:border-gold-300/50 transition-all">
        <Icon size={34} className="text-gold-300" />
        <span className="font-semibold gold-text">{label}</span>
        <span className="text-xs text-gray-400 text-center">{hint}</span>
      </button>
    );
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold gold-text flex items-center gap-2"><Sparkles size={18} /> التحضير بالذكاء الاصطناعي</h3>
          {oldButton}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {pick('ppt', Presentation, 'بوربوينت', 'عرض شرائح جاهز للتحميل')}
          {pick('video', Video, 'فيديو', 'فيديو شرائح بنصوص وصور')}
        </div>
      </div>
    );
  }

  planRef.current = plan;
  const started = messages.length > 0;
  const needsImages = choice === 'mine' || choice === 'both';
  const aiTotal = plan?.slides.filter((x) => x.aiUrl).length || 0;
  const aiDone = plan?.slides.filter((x) => x.aiUrl && x.image).length || 0;
  const canGenerate = started && !!choice && !!textSource && (textSource !== 'mine' || myText.trim().length > 10) && (!needsImages || mine.length > 0) && !busy;

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy('chat');
    try {
      const reply = await callAI('chat', mode, next);
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'حصل خطأ');
    }
    setBusy(null);
  };

  const addImages = async (files: FileList | null) => {
    if (!files) return;
    const urls: string[] = [];
    for (const f of Array.from(files).slice(0, 12)) {
      try { urls.push(await fileToDataUrl(f)); } catch { /* تجاهل الملف */ }
    }
    setMine((prev) => [...prev, ...urls]);
  };

  const generate = async (ov?: { choice: ImageChoice; textSource: TextSource; msgs: Msg[] }) => {
    const ch = ov?.choice ?? choice;
    const ts = ov?.textSource ?? textSource;
    const msgs = ov?.msgs ?? messages;
    if (!ch) return;
    setBusy('plan');
    try {
      const src = ch === 'none' ? 'من غير صور' : ch === 'mine' ? 'صور الخادم فقط' : ch === 'ai' ? 'صور ذكاء اصطناعي فقط' : 'صور الخادم أولًا ثم ذكاء اصطناعي لباقي الشرائح';
      const textPart = ts === 'mine'
        ? `الكلام عندي جاهز. استخدمه بالظبط كنص السرد (narration) من غير ما تغيّر كلماته، وقسّمه على الشرائح، واكتب العناوين والنقاط منه:\n${myText.trim().slice(0, 7000)}`
        : 'اكتب الكلام بنفسك.';
      const ask: Msg = { role: 'user', content: `جهّز الآن ${mode === 'ppt' ? 'العرض' : 'الفيديو'} بناءً على كل اللي اتكلمنا فيه. مصدر الصور: ${src}. ${textPart}` };
      const raw = await callAI('plan', mode, [...msgs, ask]);
      const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      const slides: Slide[] = (parsed.slides || []).map((s: Slide, i: number) => ({
        title: String(s.title || ''),
        bullets: Array.isArray(s.bullets) ? s.bullets.map(String) : [],
        narration: String(s.narration || ''),
        imagePrompt: String(s.imagePrompt || s.title || ''),
        image: ch === 'mine' ? mine[i % mine.length] : ch === 'both' ? mine[i] : undefined,
        aiUrl: ch === 'mine' || ch === 'none' || (ch === 'both' && mine[i]) ? undefined : aiImageUrl(String(s.imagePrompt || s.title), i),
      }));
      if (!slides.length) throw new Error('empty');
      const planTitle = String(parsed.title || 'تحضير');
      setPlan({ title: planTitle, slides });
      const meta = { choice: ch, messages: msgs };
      void persist(planTitle, slides, meta);
      if (slides.some((x) => x.aiUrl)) void runQueue(planTitle, slides, meta);
    } catch (e) {
      toast('error', e instanceof Error && e.message !== 'empty' && !(e instanceof SyntaxError) ? e.message : 'ما قدرتش أجهّز التحضير. جرّب تاني.');
    }
    setBusy(null);
  };

  const quick = () => {
    const text = input.trim();
    if (!text || busy) return;
    const msgs: Msg[] = [{ role: 'user', content: text }];
    setMessages(msgs);
    setInput('');
    setChoice('ai');
    setTextSource('ai');
    void generate({ choice: 'ai', textSource: 'ai', msgs });
  };

  const styleFor = (r: number) => (r < 1 ? 'warm, calm and slow' : r > 1 ? 'warm, lively and a bit fast' : 'warm and friendly');

  const getAudio = async (text: string) => {
    const key = `${voiceId}|${rate}|${text}`;
    let b = audioCache.current.get(key);
    if (!b) {
      b = await fetchTts(text, voiceId, styleFor(rate));
      audioCache.current.set(key, b);
    }
    return b;
  };

  const playSlide = async (i: number) => {
    if (!plan) return;
    curAudio.current?.pause();
    window.speechSynthesis?.cancel();
    const text = plan.slides[i].narration;
    if (!voiceId) return speak(text);
    setAudioBusy(i);
    try {
      const a = new Audio(URL.createObjectURL(await getAudio(text)));
      curAudio.current = a;
      await a.play();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'تعذر تشغيل الصوت');
      speak(text);
    }
    setAudioBusy(null);
  };

  const startEdit = (i: number) => {
    if (!plan) return;
    const sl = plan.slides[i];
    setEditIdx(i);
    setDraft({ title: sl.title, bullets: sl.bullets.join('\n'), narration: sl.narration });
  };

  const saveEdit = () => {
    if (!plan || editIdx === null || !draft) return;
    const slides = plan.slides.map((x, k) => k === editIdx ? { ...x, title: draft.title.trim() || x.title, bullets: draft.bullets.split('\n').map((t) => t.trim()).filter(Boolean), narration: draft.narration.trim() } : x);
    setPlan({ ...plan, slides });
    setEditIdx(null);
    setDraft(null);
    void persist(plan.title, slides);
  };

  const download = async () => {
    if (!plan) return;
    setBusy('export');
    setProgress(0);
    setExportPhase(mode === 'ppt' && !withAudio ? 'video' : 'audio');
    try {
      const makeAudios = async () => {
        const n = plan.slides.length;
        const audios: (Blob | null)[] = new Array(n).fill(null);
        let failed = 0;
        let next = 0;
        let done = 0;
        setExportPhase('audio');
        const worker = async () => {
          while (next < n) {
            const i = next++;
            try {
              if (!voiceId) throw new Error('no voice');
              audios[i] = await getAudio(plan.slides[i].narration);
            } catch {
              failed++;
            }
            setProgress(++done);
          }
        };
        await Promise.all([worker(), worker(), worker()]);
        if (failed) toast('error', failed === plan.slides.length ? 'تعذر توليد الصوت، هيطلع من غير صوت.' : 'بعض الشرايح هتطلع من غير صوت.');
        setExportPhase('video');
        setProgress(0);
        return audios;
      };
      if (mode === 'ppt') await exportPptx(plan.title, plan.slides, withAudio ? await makeAudios() : undefined);
      else await exportVideo(plan.title, plan.slides, await makeAudios(), setProgress);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'فشل التحميل');
    }
    setBusy(null);
  };

  const choiceBtn = (id: ImageChoice, label: string) => (
    <button onClick={() => setChoice(id)} className={`flex-1 px-2 py-2.5 rounded-xl text-xs border transition-all ${choice === id ? 'border-gold-300/60 bg-gold-300/10 text-gold-300' : 'border-white/10 text-gray-400'}`}>
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold gold-text flex items-center gap-2">
          {mode === 'ppt' ? <Presentation size={18} /> : <Video size={18} />} تحضير {mode === 'ppt' ? 'بوربوينت' : 'فيديو'}
        </h3>
        <div className="flex items-center gap-3">
          {oldButton}
          <button onClick={reset} className="text-xs text-gray-400 hover:text-gold-300">تحضير جديد</button>
        </div>
      </div>

      <div className="card-dark p-4 space-y-3">
        <div className="bg-dark-300 rounded-xl px-3 py-2 text-sm text-gray-200">{GREETING}</div>
        {messages.map((m, i) => (
          <div key={i} className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-gold-300/10 text-gold-100 mr-8' : 'bg-dark-300 text-gray-200 ml-8'}`}>{m.content}</div>
        ))}
        {busy === 'chat' && <p className="text-xs text-gray-400">بيكتب...</p>}
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} className="input-dark" placeholder="اكتب فكرة الدرس أو ردّ على الذكاء الاصطناعي..." />
          <button onClick={send} disabled={!input.trim() || !!busy} className="btn-gold px-4 rounded-lg" aria-label="إرسال"><Send size={16} /></button>
        </div>
        {!started && input.trim() && !busy && (
          <button onClick={quick} className="btn-gold w-full py-2 rounded-lg text-sm flex items-center justify-center gap-2">
            <Wand2 size={16} /> تحضير سريع (من غير أسئلة)
          </button>
        )}
      </div>

      {started && (
        <div className="card-dark p-4 space-y-3">
          <p className="text-sm text-gray-300">الصور تيجي منين؟</p>
          <div className="flex gap-2">
            {choiceBtn('mine', 'صور من عندي')}
            {choiceBtn('ai', 'ذكاء اصطناعي')}
            {choiceBtn('both', 'الاتنين معًا')}
            {choiceBtn('none', 'من غير صور')}
          </div>
          {needsImages && (
            <div className="space-y-2">
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void addImages(e.target.files); e.target.value = ''; }} />
              <button onClick={() => fileRef.current?.click()} className="btn-outline-gold px-3 py-2 rounded-lg text-xs flex items-center gap-1.5"><ImagePlus size={14} /> أضف صور</button>
              <div className="flex gap-2 flex-wrap">
                {mine.map((src, i) => (
                  <div key={i} className="relative w-16 h-16">
                    <img src={src} alt="" className="w-16 h-16 object-cover rounded-lg" />
                    <button onClick={() => setMine(mine.filter((_, k) => k !== i))} className="absolute -top-1 -left-1 bg-red-600 rounded-full p-0.5" aria-label="إغلاق"><X size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-sm text-gray-300 pt-1">الكلام يجي منين؟</p>
          <div className="flex gap-2">
            {([['mine', 'كلام من عندي'], ['ai', 'ذكاء اصطناعي']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTextSource(id)} className={`flex-1 px-2 py-2.5 rounded-xl text-xs border transition-all ${textSource === id ? 'border-gold-300/60 bg-gold-300/10 text-gold-300' : 'border-white/10 text-gray-400'}`}>{label}</button>
            ))}
          </div>
          {textSource === 'mine' && (
            <textarea value={myText} onChange={(e) => setMyText(e.target.value)} rows={5} className="input-dark" placeholder="اكتب أو الصق الكلام اللي عايزه في العرض..." />
          )}
          <div className="space-y-1.5">
            <p className="text-sm text-gray-300">الصوت (ذكاء اصطناعي بلهجة مصرية)</p>
            <div className="flex gap-2">
              <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className="input-dark flex-1">
                {apiVoices.length === 0 && <option value="">صوت المتصفح</option>}
                {apiVoices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
              <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="input-dark w-24">
                <option value={0.8}>بطيء</option>
                <option value={1}>عادي</option>
                <option value={1.2}>سريع</option>
              </select>
            </div>
          </div>
          {mode === 'ppt' && (
            <div className="space-y-1.5">
              <p className="text-sm text-gray-300">صوت في البوربوينت؟</p>
              <div className="flex gap-2">
                {([[true, 'بصوت (تجريبي)'], [false, 'من غير صوت']] as const).map(([val, label]) => (
                  <button key={label} onClick={() => setWithAudio(val)} className={`flex-1 px-2 py-2.5 rounded-xl text-xs border transition-all ${withAudio === val ? 'border-gold-300/60 bg-gold-300/10 text-gold-300' : 'border-white/10 text-gray-400'}`}>{label}</button>
                ))}
              </div>
              {withAudio && <p className="text-xs text-gray-400">الصوت بيتحط على أيقونة سماعة في كل شريحة، وبيشتغل في PowerPoint (مش في Google Slides).</p>}
            </div>
          )}
          <button onClick={() => generate()} disabled={!canGenerate} className="btn-gold w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm">
            <Wand2 size={16} /> {busy === 'plan' ? 'جاري التجهيز...' : plan ? 'جهّز التحضير من جديد' : 'جهّز التحضير'}
          </button>
        </div>
      )}

      {plan && (
        <div className="space-y-3">
          <h4 className="font-semibold gold-text">{plan.title}</h4>
          {plan.slides.map((s, i) => (
            <div key={i} className="card-dark p-3 flex gap-3">
              {s.image ? (
                <img src={s.image} alt="" className="w-28 h-20 object-cover rounded-lg shrink-0 bg-dark-300" />
              ) : s.aiUrl ? (
                <div className="w-28 h-20 rounded-lg shrink-0 bg-dark-300 flex items-center justify-center text-[10px] text-gray-400 text-center px-1">
                  {imgLoading ? 'جاري توليد الصورة...' : 'الصورة لسه ماتولدتش'}
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                {editIdx === i && draft ? (
                  <div className="space-y-2">
                    <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="input-dark" placeholder="العنوان" />
                    <textarea value={draft.bullets} onChange={(e) => setDraft({ ...draft, bullets: e.target.value })} rows={3} className="input-dark" placeholder="النقاط (كل نقطة في سطر)" />
                    <textarea value={draft.narration} onChange={(e) => setDraft({ ...draft, narration: e.target.value })} rows={3} className="input-dark" placeholder="الكلام" />
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="btn-gold px-4 py-1.5 rounded-lg text-xs">حفظ</button>
                      <button onClick={() => { setEditIdx(null); setDraft(null); }} className="btn-outline-gold px-4 py-1.5 rounded-lg text-xs">إلغاء</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-gold-300">{i + 1}. {s.title}</p>
                    <ul className="text-xs text-gray-300 list-disc pr-4 mt-1">{s.bullets.map((b, k) => <li key={k}>{b}</li>)}</ul>
                    <p className="text-xs text-gray-400 mt-1">{s.narration}</p>
                  </>
                )}
              </div>
              <div className="flex flex-col gap-1 self-start">
                <button onClick={() => playSlide(i)} title="اسمع" className="text-gold-300 p-1">{audioBusy === i ? <span className="text-[10px]">...</span> : <Volume2 size={16} />}</button>
                <button onClick={() => startEdit(i)} title="عدّل الكلام" className="text-gold-300 p-1" aria-label="عدّل الكلام"><Pencil size={16} /></button>
              </div>
            </div>
          ))}
          <button onClick={download} disabled={!!busy} className="btn-gold w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm">
            <Download size={16} /> {busy === 'export' ? (mode === 'video' ? (exportPhase === 'audio' ? `جاري توليد الصوت ${progress}/${plan.slides.length}...` : `جاري تسجيل الفيديو ${progress}/${plan.slides.length} (سيب الصفحة مفتوحة)`) : exportPhase === 'audio' ? `جاري توليد الصوت ${progress}/${plan.slides.length}...` : 'جاري التحميل...') : imgLoading ? `تحميل الآن (الصور ${aiDone}/${aiTotal} جاهزة)` : mode === 'ppt' ? 'تحميل البوربوينت' : 'تحميل الفيديو'}
          </button>
          {!imgLoading && plan.slides.some((x) => x.aiUrl && !x.image) && (
            <button onClick={() => runQueue(plan.title, plan.slides)} className="btn-outline-gold w-full py-2 rounded-lg text-xs">
              أعد توليد الصور الناقصة
            </button>
          )}
        </div>
      )}
    </div>
  );
}

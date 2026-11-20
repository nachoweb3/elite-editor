// Local open-source generation with stable-diffusion.cpp (sd-cli).
// Images: SD 1.5 checkpoints. Video: Wan 2.1 T2V 1.3B with CPU offload.
// Everything runs on this computer; no API key and no upload of the user's footage.
import fs from 'node:fs/promises';
import {existsSync, createWriteStream} from 'node:fs';
import path from 'node:path';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {ROOT, atomic} from './core.mjs';
import {assertQuota, recordUsage} from './usage.mjs';

const execFileAsync = promisify(execFile);
const BASE = path.join(ROOT, 'cache/local-ai');
const BIN_DIR = path.join(BASE, 'bin');
const MODELS_DIR = path.join(BASE, 'models');
const OUT_DIR = path.join(ROOT, 'projects/generations');
const ENGINE_ZIP = path.join(BASE, 'sd-engine.zip');
const ENGINE_URL = 'https://github.com/leejet/stable-diffusion.cpp/releases/download/master-1104-5dcfa79/sd-master-5dcfa79-bin-win-vulkan-x64.zip';
const BINARY = process.platform === 'win32' ? 'sd-cli.exe' : 'sd-cli';
const JOB_RE = /^local-[a-f0-9-]{36}\.json$/;

export const LOCAL_MODELS = [
  {
    id: 'dreamshaper-8',
    name: 'DreamShaper 8 · SD 1.5',
    kind: 'image',
    type: 'sd1',
    description: 'Imagen local rápida y versátil. 512 px, sin clave ni conexión.',
    sizeGB: 2.1,
    filename: 'DreamShaper_8_pruned.safetensors',
    url: 'https://huggingface.co/Lykon/DreamShaper/resolve/main/DreamShaper_8_pruned.safetensors',
    steps: 20,
    cfg: 7.5,
    sampler: 'euler_a',
    ratios: ['1:1', '16:9', '9:16'],
  },
  {
    id: 'animatediff-v3',
    name: 'AnimateDiff v3 · SD 1.5',
    kind: 'video',
    type: 'animatediff',
    description: 'Animación local 384p y 8/16 fotogramas. Reutiliza DreamShaper y funciona en 4 GB de VRAM.',
    sizeGB: 0.85,
    filename: 'mm_sd15_v3.safetensors',
    url: 'https://huggingface.co/conrevo/AnimateDiff-A1111/resolve/main/motion_module/mm_sd15_v3.safetensors',
    requires: 'dreamshaper-8',
    frames: 8,
    frameOptions: [8, 16],
    fps: 8,
    ratios: ['1:1'],
  },
  {
    id: 'wan21-t2v-1.3b',
    name: 'Wan 2.1 T2V 1.3B · vídeo',
    kind: 'video',
    type: 'wan21',
    description: 'Vídeo open-source local (480p, sin audio). En 4 GB de VRAM usa CPU y tarda varios minutos.',
    sizeGB: 6.0,
    offload: true,
    frames: 33,
    ratios: ['16:9', '9:16'],
    files: [
      {
        filename: 'wan2.1_t2v_1.3B_fp16.safetensors',
        sizeGB: 2.6,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_t2v_1.3B_fp16.safetensors',
      },
      {
        filename: 'wan_2.1_vae.safetensors',
        sizeGB: 0.25,
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors',
      },
      {
        filename: 'umt5-xxl-encoder-Q4_K_M.gguf',
        sizeGB: 3.1,
        url: 'https://huggingface.co/city96/umt5-xxl-encoder-gguf/resolve/main/umt5-xxl-encoder-Q4_K_M.gguf',
      },
    ],
  },
];

let installState = null;
let installAbort = null;
let activeGen = null;
const lastProgress = new Map();

function modelById(id) {
  return LOCAL_MODELS.find((m) => m.id === id) || null;
}
function modelFiles(model) {
  return model.files || [{filename: model.filename, sizeGB: model.sizeGB, url: model.url}];
}
function binaryPath() {
  return path.join(BIN_DIR, BINARY);
}
function assertPlatform() {
  if (process.platform !== 'win32') throw Error('La generación local está preparada para Windows x64');
}
async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}
async function installed(model) {
  for (const file of modelFiles(model)) {
    if (!(await exists(path.join(MODELS_DIR, file.filename)))) return false;
  }
  if (model.requires) {
    const base = modelById(model.requires);
    if (!base || !(await installed(base))) return false;
  }
  return true;
}
async function findBinary(dir) {
  const entries = await fs.readdir(dir, {withFileTypes: true}).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === BINARY) return full;
    if (entry.isDirectory()) {
      const hit = await findBinary(full);
      if (hit) return hit;
    }
  }
  return null;
}
async function engineInfo() {
  let found = null;
  try { found = await findBinary(BIN_DIR); } catch {}
  return {installed: !!found, path: found || undefined};
}
// Local jobs are private to the account that launched them. Older jobs without
// an owner stay visible only to the studio owner.
const readable = (job, user) => !!job && (job.ownerId ? job.ownerId === user?.id : user?.role === 'owner');

async function listJobs(user = null) {
  await fs.mkdir(OUT_DIR, {recursive: true});
  const files = (await fs.readdir(OUT_DIR)).filter((f) => JOB_RE.test(f));
  const jobs = await Promise.all(files.map(async (f) => {
    try { return JSON.parse(await fs.readFile(path.join(OUT_DIR, f), 'utf8')); } catch { return null; }
  }));
  return jobs.filter(job => readable(job, user))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 30);
}
async function saveJob(job) {
  await fs.mkdir(OUT_DIR, {recursive: true});
  await atomic(path.join(OUT_DIR, `local-${job.id}.json`), job);
}

export async function localStatus(user = null) {
  const engine = await engineInfo();
  const models = await Promise.all(LOCAL_MODELS.map(async (m) => ({
    id: m.id,
    name: m.name,
    kind: m.kind,
    description: m.description,
    sizeGB: m.sizeGB,
    offload: !!m.offload,
    frames: m.frames,
    frameOptions: m.frameOptions,
    fps: m.fps,
    requires: m.requires,
    baseInstalled: m.requires ? await installed(modelById(m.requires)) : true,
    ratios: m.ratios,
    files: modelFiles(m).map((f) => ({filename: f.filename, sizeGB: f.sizeGB})),
    installed: await installed(m),
  })));
  const jobs = await listJobs(user);
  const liveJob = activeGen && readable(activeGen.job, user)
    ? {...activeGen.job, progress: lastProgress.get(activeGen.job.id) || activeGen.job.progress}
    : null;
  const cleaned = jobs.map((job) => {
    if (job.status !== 'running' || job.id === liveJob?.id) return job;
    return {...job, status: 'failed', error: 'La generación se interrumpió al cerrar el servidor'};
  });
  if (liveJob) {
    const index = cleaned.findIndex((job) => job.id === liveJob.id);
    if (index >= 0) cleaned[index] = liveJob;
    else cleaned.unshift(liveJob);
  }
  return {
    supported: process.platform === 'win32',
    platform: `${process.platform}-${process.arch}`,
    engine,
    models,
    jobs: cleaned.slice(0, 30),
    activeInstall: installState,
    busy: !!activeGen,
    activeJob: liveJob,
  };
}

function setInstall(patch) {
  installState = {...installState, ...patch, updatedAt: new Date().toISOString()};
}
async function download(url, dest, onBytes, signal) {
  const part = dest + '.part';
  let start = 0;
  try { start = (await fs.stat(part)).size; } catch {}
  const headers = {'User-Agent': 'NACHO-Web3-Studio/1.0'};
  if (start > 0) headers.Range = `bytes=${start}-`;
  const response = await fetch(url, {headers, signal, redirect: 'follow'});
  if (!response.ok) throw Error(`La descarga respondió HTTP ${response.status}`);
  let skip = start;
  if (response.status === 200) {
    skip = 0;
    start = 0;
  }
  const length = Number(response.headers.get('content-length')) || 0;
  const total = length + start;
  const handle = await fs.open(part, start > 0 ? 'a' : 'w');
  let received = start;
  try {
    const reader = response.body.getReader();
    let lastTick = 0;
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      let chunk = Buffer.from(value);
      if (skip > 0) {
        if (chunk.length <= skip) { skip -= chunk.length; continue; }
        chunk = chunk.subarray(skip);
        skip = 0;
      }
      await handle.write(chunk);
      received += chunk.length;
      const now = Date.now();
      if (now - lastTick > 250) { onBytes(received, total); lastTick = now; }
    }
    onBytes(received, total);
  } finally {
    await handle.close();
  }
  if (total > 0 && received < total) throw Error('La descarga quedó incompleta');
  await fs.rename(part, dest);
  return received;
}
async function extractEngine() {
  await fs.mkdir(BIN_DIR, {recursive: true});
  if (process.platform === 'win32') {
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    await execFileAsync(tar, ['-xf', ENGINE_ZIP, '-C', BIN_DIR], {windowsHide: true});
  } else {
    await execFileAsync('unzip', ['-o', ENGINE_ZIP, '-d', BIN_DIR]);
  }
}
export async function installLocal(input) {
  assertPlatform();
  if (installState?.active) throw Error('Ya hay una descarga en curso');
  if (!['engine', 'model'].includes(input?.kind)) throw Error('Instalación no válida');
  const model = input.kind === 'model' ? modelById(input.modelId) : null;
  if (input.kind === 'model' && !model) throw Error('Modelo local no admitido');
  if (input.kind === 'engine' && (await engineInfo()).installed) return localStatus();
  if (model && await installed(model)) return localStatus();

  installAbort = new AbortController();
  installState = {
    active: true,
    kind: input.kind,
    id: model?.id || 'engine',
    label: model?.name || 'Motor sd.cpp',
    received: 0,
    total: 0,
    percent: 0,
    message: 'Preparando descarga…',
    startedAt: new Date().toISOString(),
  };

  void (async () => {
    try {
      await fs.mkdir(BASE, {recursive: true});
      if (input.kind === 'engine') {
        setInstall({message: 'Descargando motor sd.cpp (Vulkan)…', received: 0, total: 0});
        await fs.mkdir(BIN_DIR, {recursive: true});
        await download(ENGINE_URL, ENGINE_ZIP, (received, total) => setInstall({
          received, total, percent: total ? received / total : 0, message: 'Descargando motor sd.cpp (Vulkan)…',
        }), installAbort.signal);
        setInstall({message: 'Descomprimiendo motor…', percent: 0.98});
        await extractEngine();
        const found = await findBinary(BIN_DIR);
        if (!found) throw Error('El motor se descargó pero no se encontró sd-cli.exe');
        await fs.rm(ENGINE_ZIP, {force: true});
      } else {
        await fs.mkdir(MODELS_DIR, {recursive: true});
        const files = modelFiles(model);
        const knownTotal = files.reduce((sum, f) => sum + f.sizeGB * 1024 ** 3, 0);
        let doneBytes = 0;
        for (const file of files) {
          setInstall({message: `Descargando ${file.filename}…`, received: doneBytes, total: knownTotal});
          await download(file.url, path.join(MODELS_DIR, file.filename), (received, total) => {
            const overall = doneBytes + received;
            const overallTotal = Math.max(knownTotal, overall);
            setInstall({
              received: overall,
              total: overallTotal,
              percent: Math.min(0.99, overall / overallTotal),
              message: `Descargando ${file.filename}…`,
            });
          }, installAbort.signal);
          doneBytes += (await fs.stat(path.join(MODELS_DIR, file.filename))).size;
        }
      }
      setInstall({active: false, percent: 1, message: 'Instalación completada', finishedAt: new Date().toISOString()});
    } catch (error) {
      const cancelled = installAbort?.signal.aborted;
      setInstall({
        active: false,
        message: cancelled ? 'Descarga cancelada' : `Error: ${error.message}`,
        error: cancelled ? undefined : error.message,
        finishedAt: new Date().toISOString(),
      });
    } finally {
      installAbort = null;
    }
  })();
  return localStatus();
}

export async function cancelLocalInstall() {
  if (!installState?.active || !installAbort) throw Error('No hay una descarga en curso');
  installAbort.abort();
  setInstall({message: 'Cancelando descarga…'});
  return localStatus();
}

function dimensions(model, ratio) {
  if (model.type === 'animatediff') return [384, 384];
  if (model.kind === 'video') {
    return ratio === '9:16' ? [480, 832] : [832, 480];
  }
  if (ratio === '16:9') return [768, 432];
  if (ratio === '9:16') return [432, 768];
  return [512, 512];
}
function buildArgs(model, prompt, ratio, frames) {
  const [width, height] = dimensions(model, ratio);
  const seed = Math.floor(Math.random() * 2147483647);
  const args = [];
  if (model.kind === 'image') {
    args.push('-m', path.join(MODELS_DIR, model.filename));
    args.push('-p', prompt, '-n', 'texto, marca de agua, baja calidad, borroso');
    args.push('--steps', String(model.steps), '--cfg-scale', String(model.cfg));
    args.push('--sampling-method', model.sampler, '--seed', String(seed));
    args.push('-W', String(width), '-H', String(height), '-v');
    return {args, width, height, ext: 'png'};
  }
  if (model.type === 'animatediff') {
    const base = modelById(model.requires);
    if (!base) throw Error('Falta el modelo base de AnimateDiff');
    args.push('-M', 'vid_gen');
    args.push('--model', path.join(MODELS_DIR, modelFiles(base)[0].filename));
    args.push('--motion-module', path.join(MODELS_DIR, model.filename));
    args.push('-p', prompt, '-n', 'texto, marca de agua, baja calidad, borroso');
    args.push('--cfg-scale', '8', '--sampling-method', 'euler', '--scheduler', 'discrete');
    args.push('--steps', '20', '--offload-to-cpu', '--max-vram', '2.0');
    args.push('--video-frames', String(frames || model.frames), '--fps', String(model.fps || 8));
    args.push('-W', String(width), '-H', String(height), '--seed', String(seed), '-v');
    return {args, width, height, ext: 'avi'};
  }
  const files = modelFiles(model);
  const diffusion = path.join(MODELS_DIR, files[0].filename);
  const vae = path.join(MODELS_DIR, files[1].filename);
  const t5 = path.join(MODELS_DIR, files[2].filename);
  args.push('-M', 'vid_gen', '--diffusion-model', diffusion, '--vae', vae, '--t5xxl', t5);
  args.push('-p', prompt, '-n', 'texto, marca de agua, baja calidad, borroso, estático');
  args.push('--cfg-scale', '6', '--sampling-method', 'euler', '--steps', '25');
  args.push('--video-frames', String(frames || model.frames || 33), '--flow-shift', '3');
  args.push('--diffusion-fa', '--vae-tiling');
  if (model.offload) args.push('--offload-to-cpu', '--max-vram', '2.0');
  args.push('-W', String(width), '-H', String(height), '--seed', String(seed), '-v');
  return {args, width, height, ext: 'avi'};
}
function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {stdio: 'ignore', windowsHide: true});
    return;
  }
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }
  }, 5000).unref();
}

export async function generateLocal(input, user = null) {
  assertPlatform();
  if (activeGen) throw Error('Ya hay una generación local en curso; espera o cancélala');
  const model = modelById(input?.modelId);
  if (!model) throw Error('Modelo local no admitido');
  if (!(await engineInfo()).installed) throw Error('Instala primero el motor local');
  if (!(await installed(model))) throw Error('Descarga el modelo antes de generar');
  if (typeof input.prompt !== 'string' || input.prompt.trim().length < 2 || input.prompt.length > 1200) {
    throw Error('Escribe una descripción de 2 a 1200 caracteres');
  }
  if (!model.ratios.includes(input.ratio)) throw Error('Formato no admitido por este modelo');
  const frames = model.kind === 'video' ? Number(input.frames || model.frames) : null;
  const frameOptions = model.frameOptions || [17, 33];
  if (model.kind === 'video' && !frameOptions.includes(frames)) throw Error('Duración de vídeo no admitida');
  if (installState?.active) throw Error('Espera a que termine la descarga en curso');
  await assertQuota(user, 'generations', 1);

  const id = randomUUID();
  const job = {
    id,
    ownerId: user?.id || null,
    provider: 'local',
    model: model.id,
    modelName: model.name,
    kind: model.kind,
    prompt: input.prompt.trim(),
    ratio: input.ratio,
    frames: frames || undefined,
    status: 'running',
    progress: 0,
    step: 0,
    totalSteps: model.kind === 'video' ? 25 : model.steps,
    message: 'Cargando modelo en memoria…',
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
  };
  await saveJob(job);
  await recordUsage(user, 'generations', 1);
  const {args, ext} = buildArgs(model, job.prompt, input.ratio, frames);
  const outFile = path.join(OUT_DIR, `local-${id}.${ext}`);
  args.push('-o', outFile);
  const binary = await findBinary(BIN_DIR);
  if (!binary) throw Error('No se encontró sd-cli.exe');
  activeGen = {job, child: null, cancelled: false};
  lastProgress.set(id, 0);

  const child = spawn(binary, args, {
    cwd: path.dirname(binary),
    env: {...process.env, PYTHONUNBUFFERED: '1'},
    windowsHide: true,
    detached: process.platform !== 'win32',
  });
  activeGen.child = child;
  let output = '';
  let progressState = {tail: '', lastStep: 0, lastTotalSteps: 0};
  const onChunk = (data) => {
    const text = data.toString();
    output = (output + text).slice(-6000);
    const normalized = text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\r/g, '\n');
    const combined = progressState.tail + normalized;
    const patterns = [/step\s+(\d+)\s*\/\s*(\d+)/ig, /(\d+)\s*\/\s*(\d+)\s*-\s*[\d.]+s\/it/ig];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(combined))) {
        const step = Number.parseInt(match[1], 10);
        const totalSteps = Number.parseInt(match[2], 10);
        if (!Number.isFinite(step) || !Number.isFinite(totalSteps) || totalSteps <= 0) continue;
        if (totalSteps !== progressState.lastTotalSteps) {
          progressState.lastTotalSteps = totalSteps;
          progressState.lastStep = 0;
        }
        if (step <= progressState.lastStep) continue;
        progressState.lastStep = step;
        job.step = step;
        job.totalSteps = totalSteps;
        job.progress = Math.min(0.99, step / totalSteps);
        job.message = `Generando ${step}/${totalSteps}…`;
        lastProgress.set(id, job.progress);
        void saveJob(job).catch(() => {});
      }
    }
    progressState.tail = combined.slice(-1024);
  };
  child.stdout.on('data', onChunk);
  child.stderr.on('data', onChunk);

  const heartbeat = setInterval(() => {
    if (job.step === 0 && !activeGen?.cancelled) {
      const seconds = Math.round((Date.now() - Date.parse(job.startedAt)) / 1000);
      job.message = `Cargando modelo (${seconds}s)…`;
      lastProgress.set(id, job.progress);
    }
  }, 8000);

  child.on('error', (error) => { output += `\n${error.message}`; });
  child.on('close', async (code) => {
    clearInterval(heartbeat);
    const cancelled = activeGen?.cancelled;
    let finalFile = outFile;
    let finalExt = ext;
    if (cancelled) {
      job.status = 'cancelled';
      job.message = 'Generación cancelada';
      await fs.rm(outFile, {force: true});
    } else if (code === 0 && await exists(outFile)) {
      if (model.kind === 'video') {
        job.message = 'Convirtiendo el vídeo a MP4…';
        lastProgress.set(id, job.progress);
        await saveJob(job);
        finalFile = path.join(OUT_DIR, `local-${id}.mp4`);
        try {
          await execFileAsync('ffmpeg', [
            '-y', '-i', outFile, '-c:v', 'libx264', '-preset', 'veryfast',
            '-crf', '20', '-pix_fmt', 'yuv420p', '-an', finalFile,
          ], {windowsHide: true, timeout: 15 * 60 * 1000, maxBuffer: 8 * 1024 * 1024});
          await fs.rm(outFile, {force: true});
          finalExt = 'mp4';
        } catch (error) {
          job.status = 'failed';
          job.error = `No se pudo convertir el vídeo: ${error.message}`;
          job.message = 'La conversión falló';
        }
      }
      if (job.status !== 'failed') {
        job.status = 'succeeded';
        job.progress = 1;
        job.message = 'Listo';
        job.url = `/nacho-api/generative/local/file?id=${id}`;
        job.fileName = path.basename(finalFile);
        job.fileExt = finalExt;
      }
    } else {
      job.status = 'failed';
      const tail = output.trim().split('\n').slice(-6).join(' ').slice(-500);
      job.error = tail || `sd-cli terminó con código ${code}`;
      job.message = 'La generación falló';
    }
    job.finishedAt = new Date().toISOString();
    await saveJob(job);
    lastProgress.delete(id);
    activeGen = null;
  });
  return job;
}

export async function cancelLocalGeneration(user = null) {
  if (!activeGen || (activeGen.job.ownerId && activeGen.job.ownerId !== user?.id)) throw Error('No hay una generación local en curso');
  activeGen.cancelled = true;
  killTree(activeGen.child);
  return {...activeGen.job, status: 'cancelling'};
}

export async function localFile(id, user = null) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw Error('Trabajo inválido');
  const jobFile = path.join(OUT_DIR, `local-${id}.json`);
  const job = JSON.parse(await fs.readFile(jobFile, 'utf8'));
  if (!readable(job, user) || !job.fileName || job.status !== 'succeeded') throw Error('Archivo no disponible');
  const target = path.join(OUT_DIR, path.basename(job.fileName));
  if (!target.startsWith(OUT_DIR + path.sep) || !(await exists(target))) throw Error('Archivo no disponible');
  return target;
}

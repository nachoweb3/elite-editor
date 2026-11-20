// Plans and usage. This is the piece that turns local accounts into something
// that can be sold: every expensive action asks the account's plan first and
// the consumption is stored per user and per month.
//
// The owner of this installation keeps unlimited access; the limits exist so a
// second account cannot queue unbounded renders, generations or uploads.
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,atomic,list,json,projectDir,readAssets} from './core.mjs';

const FILE = process.env.STUDIO_USAGE_FILE
  ? path.resolve(ROOT, process.env.STUDIO_USAGE_FILE)
  : path.join(ROOT, 'data', 'usage.json');

const number = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const PLANS = {
  free: {
    key: 'free',
    label: 'Gratis',
    limits: {
      renderMinutes: number(process.env.STUDIO_FREE_RENDER_MINUTES, 240),
      generations: number(process.env.STUDIO_FREE_GENERATIONS, 100),
      uploadGB: number(process.env.STUDIO_FREE_UPLOAD_GB, 25),
      storageGB: number(process.env.STUDIO_FREE_STORAGE_GB, 50),
      projects: number(process.env.STUDIO_FREE_PROJECTS, 100),
    },
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    limits: {
      renderMinutes: number(process.env.STUDIO_PRO_RENDER_MINUTES, 1500),
      generations: number(process.env.STUDIO_PRO_GENERATIONS, 1000),
      uploadGB: number(process.env.STUDIO_PRO_UPLOAD_GB, 200),
      storageGB: number(process.env.STUDIO_PRO_STORAGE_GB, 500),
      projects: number(process.env.STUDIO_PRO_PROJECTS, 500),
    },
  },
  studio: {
    key: 'studio',
    label: 'Estudio',
    unlimited: true,
    limits: {renderMinutes: Infinity, generations: Infinity, uploadGB: Infinity, storageGB: Infinity, projects: Infinity},
  },
};

export const METRICS = {
  renderMinutes: 'minutos de render',
  generations: 'generaciones con IA',
  uploadGB: 'GB importados',
  storageGB: 'GB almacenados',
  projects: 'proyectos',
};

export function planFor(user) {
  if (!user) return PLANS.free;
  if (user.role === 'owner') return PLANS.studio;
  if (user.plan === 'pro') return PLANS.pro;
  return PLANS.free;
}

export function period(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

export function resetsAt(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

// Pure so it can be tested and reasoned about: does this account have room for
// `amount` more of `metric` under `plan`?
export function evaluate(plan, used, metric, amount = 0) {
  const limit = plan?.limits?.[metric];
  if (plan?.unlimited || limit === Infinity) return {allowed: true, limit: Infinity, remaining: Infinity};
  const consumed = Number(used?.[metric]) || 0;
  const next = consumed + Math.max(0, Number(amount) || 0);
  const allowed = next <= limit;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - consumed),
    message: allowed ? '' : metric === 'storageGB'
      ? `Has alcanzado el almacenamiento del plan ${plan?.label || 'Gratis'} (${limit} GB). Elimina proyectos o vacía la papelera para liberar espacio.`
      : `Has alcanzado el límite de ${METRICS[metric] || metric} del plan ${plan?.label || 'Gratis'} (${limit}). Se reinicia el ${new Date(resetsAt()).toLocaleDateString('es-ES')}.`,
  };
}

let queue = Promise.resolve();

async function read() {
  try {
    const value = JSON.parse(await fs.readFile(FILE, 'utf8'));
    return {users: value.users && typeof value.users === 'object' ? value.users : {}};
  } catch (error) {
    if (error.code === 'ENOENT') return {users: {}};
    throw error;
  }
}

function mutate(change) {
  const task = queue.then(async () => {
    const data = await read();
    const result = await change(data);
    await fs.mkdir(path.dirname(FILE), {recursive: true});
    await atomic(FILE, data);
    return result;
  });
  queue = task.catch(() => {});
  return task;
}

function recordFor(data, userId, now = new Date()) {
  const month = period(now);
  const current = data.users[userId];
  if (!current || current.period !== month) {
    data.users[userId] = {period: month, renderMinutes: 0, generations: 0, uploadGB: 0, projects: 0, updatedAt: now.toISOString()};
  }
  return data.users[userId];
}

export async function usedFor(userId, now = new Date()) {
  const record = (await read()).users[userId];
  if (!record || record.period !== period(now)) return {period: period(now), renderMinutes: 0, generations: 0, uploadGB: 0, projects: 0};
  return record;
}

// Projects are counted, not accumulated: the metric means how many projects
// the account keeps right now, so trashing one frees room immediately.
export async function projectCount(userId) {
  if (!userId) return 0;
  return (await list()).filter(project => project.ownerId === userId && !project.trashedAt).length;
}

// Real bytes on this disk, not a monthly counter: deleting a project, emptying
// the trash or removing an imported asset frees room at once.
async function sizeOf(target) {
  try {
    const stat = await fs.stat(target);
    if (!stat.isDirectory()) return stat.size;
    let total = 0;
    const entries = await fs.readdir(target, {withFileTypes: true});
    for (const entry of entries) total += await sizeOf(path.join(target, entry.name));
    return total;
  } catch {
    return 0;
  }
}

async function storageBytes(userId) {
  if (!userId) return 0;
  const projects = (await list()).filter(project => project.ownerId === userId);
  let bytes = 0;
  const sources = new Set();
  for (const project of projects) {
    if (project.source && !sources.has(project.source)) {
      sources.add(project.source);
      bytes += await sizeOf(project.source);
    }
    bytes += await sizeOf(projectDir(project.id));
  }
  const assets = await readAssets().catch(() => []);
  for (const asset of assets) if (asset.ownerId === userId && asset.file) bytes += await sizeOf(asset.file);
  const generations = path.join(ROOT, 'projects/generations');
  const files = await fs.readdir(generations).catch(() => []);
  for (const name of files) {
    if (!name.endsWith('.json')) continue;
    let job = null;
    try { job = JSON.parse(await fs.readFile(path.join(generations, name), 'utf8')); } catch { continue; }
    if (!job || job.ownerId !== userId) continue;
    bytes += await sizeOf(path.join(generations, name));
    if (job.fileName) bytes += await sizeOf(path.join(generations, path.basename(job.fileName)));
  }
  return bytes / 1024 ** 3;
}

export async function storageFor(userId) {
  return storageBytes(userId);
}

export async function assertProjectQuota(user, amount = 1) {
  if (!user) return;
  const plan = planFor(user);
  if (plan.unlimited) return;
  const check = evaluate(plan, {projects: await projectCount(user.id)}, 'projects', amount);
  if (check.allowed) return;
  const error = new Error(`Has alcanzado el límite de proyectos del plan ${plan.label} (${check.limit}). Envía uno a la papelera o elimina un proyecto para liberar espacio.`);
  error.status = 429;
  throw error;
}

// Remaining room for a metric, in the metric's own units. Infinity means the
// account has no limit. Uploads use this to cap the stream before writing.
export async function remainingFor(user, metric) {
  if (!user) return 0;
  const plan = planFor(user);
  if (plan.unlimited) return Infinity;
  return evaluate(plan, await usedFor(user.id), metric, 0).remaining;
}

// Ready-to-show message for a limit that is already reached.
export async function limitMessage(user, metric) {
  if (!user) return '';
  const plan = planFor(user);
  if (plan.unlimited) return '';
  return evaluate(plan, await usedFor(user.id), metric, Infinity).message;
}

export async function assertQuota(user, metric, amount = 0) {
  if (!user) return;
  const plan = planFor(user);
  if (plan.unlimited) return;
  const check = evaluate(plan, await usedFor(user.id), metric, amount);
  if (check.allowed) return;
  const error = new Error(check.message);
  error.status = 429;
  throw error;
}

export async function recordUsage(user, metric, amount) {
  if (!user) return;
  const plan = planFor(user);
  if (plan.unlimited) return;
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return;
  await mutate(data => {
    const record = recordFor(data, user.id);
    record[metric] = Number(((Number(record[metric]) || 0) + value).toFixed(3));
    record.updatedAt = new Date().toISOString();
  });
}

export async function usageSnapshot(user) {
  const plan = planFor(user);
  const used = user ? await usedFor(user.id) : {period: period(), renderMinutes: 0, generations: 0, uploadGB: 0, projects: 0};
  const metrics = await Promise.all(Object.keys(METRICS).map(async metric => {
    const limit = plan.limits[metric];
    const consumed = !user ? Number(used[metric]) || 0
      : metric === 'projects' ? await projectCount(user.id)
      : metric === 'storageGB' ? await storageBytes(user.id)
      : Number(used[metric]) || 0;
    const unlimited = plan.unlimited || limit === Infinity;
    return {
      key: metric,
      label: METRICS[metric],
      used: Number(consumed.toFixed(2)),
      limit: unlimited ? null : limit,
      remaining: unlimited ? null : Number(Math.max(0, limit - consumed).toFixed(2)),
      percent: unlimited ? null : Math.min(100, Math.round(consumed / Math.max(limit, 1) * 100)),
    };
  }));
  return {
    plan: {key: plan.key, label: plan.label, unlimited: !!plan.unlimited},
    period: period(),
    resetsAt: resetsAt(),
    metrics,
  };
}

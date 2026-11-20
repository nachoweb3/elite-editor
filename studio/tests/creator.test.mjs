import test from 'node:test';
import assert from 'node:assert/strict';
import {planShortCandidates, planShortMoments} from '../server/shorts.mjs';
import {PLANS, evaluate, planFor, resetsAt} from '../server/usage.mjs';

const words = (text, start, step = 0.3) => {
  let time = start;
  return text.split(/\s+/).filter(Boolean).map(word => {
    const item = {word, start: time, end: time + step};
    time += step;
    return item;
  });
};
const segment = (text, start, step = 0.3) => ({
  start,
  end: start + text.split(/\s+/).length * step,
  text,
  words: words(text, start, step),
});

const transcript = [
  segment('Un ordenador muy bueno.', 0),
  segment('¿Cómo montas un estudio sin gastar miles de euros?', 2),
  segment('Alquila máquinas virtuales baratas y separa el audio de la imagen.', 6),
  segment('El truco está en revisar cada frase antes de publicar el resultado.', 12),
  segment('Nunca conviene sacrificar la claridad por un efecto.', 18),
  segment('Los subtítulos deben ser breves y grandes.', 24),
  segment('Si el vídeo se entiende sin contexto, ese momento funciona como short.', 29),
  segment('La clave es editar el ritmo, no rellenar con ruido.', 36),
  segment('Puedes exportar en vertical con un solo clic.', 41),
  segment('Mirad cómo cambia el resultado cuando el encuadre sigue la cara.', 46),
];

test('el panel Creador recibe titulares, texto y motivos legibles', () => {
  const plan = planShortCandidates(transcript, {sourceDuration: 60, min: 15, max: 30});
  assert.ok(plan.items.length > 0);
  for (const item of plan.items) {
    assert.ok(item.title.length > 0);
    assert.ok(item.text.length > 0);
    assert.ok(item.reasons.length > 0 && item.reasons.length <= 3);
    assert.ok(item.score >= 0 && item.score <= 1);
    assert.ok(item.end > item.start);
  }
});

test('los clips propuestos respetan el rango pedido y no se solapan', () => {
  const plan = planShortCandidates(transcript, {sourceDuration: 60, min: 15, max: 30});
  for (const item of plan.items) {
    assert.ok(item.duration >= 14.5 && item.duration <= 30.5, `duración ${item.duration}`);
  }
  const sorted = [...plan.items].sort((a, b) => a.start - b.start);
  for (let index = 1; index < sorted.length; index++) {
    assert.ok(sorted[index].start >= sorted[index - 1].end - 0.05, 'dos clips propuestos se solapan');
  }
});

test('sin frases en el rango se amplía la búsqueda en vez de devolver una lista vacía', () => {
  const plan = planShortCandidates(transcript, {sourceDuration: 60, min: 85, max: 90});
  assert.equal(plan.fallback, true);
  assert.ok(plan.items.length > 0);
});

test('sin transcripción no se inventan momentos', () => {
  const plan = planShortCandidates([], {sourceDuration: 30});
  assert.deepEqual(plan.items, []);
});

test('el planificador de los shorts autónomos sigue igual tras el refactor', () => {
  const plan = planShortMoments(transcript, {sourceDuration: 60, count: 3});
  assert.ok(plan.items.length >= 1);
  assert.ok(plan.items.every(item => item.hook && item.id && item.status === 'planned'));
});

test('el dueño del estudio queda sin límites y las cuentas nuevas en Gratis', () => {
  assert.equal(planFor({role: 'owner', plan: 'free'}).unlimited, true);
  assert.equal(planFor({role: 'member', plan: 'free'}).key, 'free');
  assert.equal(planFor({role: 'member', plan: 'pro'}).key, 'pro');
  assert.equal(planFor(null).key, 'free');
});

test('una cuenta gratuita se bloquea al superar los minutos de render', () => {
  const under = evaluate(PLANS.free, {renderMinutes: 10}, 'renderMinutes', 5);
  assert.equal(under.allowed, true);
  assert.equal(under.remaining, PLANS.free.limits.renderMinutes - 10);
  const over = evaluate(PLANS.free, {renderMinutes: PLANS.free.limits.renderMinutes - 1}, 'renderMinutes', 2);
  assert.equal(over.allowed, false);
  assert.match(over.message, /límite/i);
  assert.equal(evaluate(PLANS.studio, {renderMinutes: 0}, 'renderMinutes', 1e6).allowed, true);
});

test('la cuota de proyectos bloquea al llegar al máximo del plan', () => {
  const limit = PLANS.free.limits.projects;
  assert.equal(evaluate(PLANS.free, {projects: limit - 1}, 'projects', 1).allowed, true);
  const full = evaluate(PLANS.free, {projects: limit}, 'projects', 1);
  assert.equal(full.allowed, false);
  assert.match(full.message, /proyectos/);
  assert.equal(evaluate(PLANS.studio, {projects: limit}, 'projects', 1).allowed, true);
});

test('el contador se reinicia el primer día del mes siguiente', () => {
  const date = new Date('2026-11-19T10:00:00Z');
  assert.equal(resetsAt(date), '2026-12-01T00:00:00.000Z');
});

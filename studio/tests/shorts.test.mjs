import test from 'node:test';
import assert from 'node:assert/strict';
import {planShortMoments,transcriptSentences,buildReframe,cleanHook} from '../server/shorts.mjs';

const words = (text, start, step = 0.28) => {
  let time = start;
  return text.split(/\s+/).filter(Boolean).map(word => {
    const item = {word, start: time, end: time + step};
    time += step;
    return item;
  });
};
const segment = (text, start, step) => ({start, end: start + text.split(/\s+/).length * step, text, words: words(text, start, step)});

test('los momentos empiezan y terminan en frases completas y los hooks no son relleno', () => {
  const transcript = [
    segment('Y es que esto es importante decirlo, porque cambia la forma de trabajar. ¿Lo ves?', 0, 0.3),
    segment('Un ordenador muy bueno. ¿Esto cómo lo solucionamos?', 8, 0.3),
    segment('Podemos alquilar máquinas virtuales baratas y seguir creando contenido sin gastar miles de euros.', 15, 0.3),
    segment('Esta información es útil para profesionales que quieren aprender a montar su propio estudio.', 30, 0.3),
    segment('La clave está en separar el audio de la imagen y revisar cada frase antes de publicar el resultado.', 45, 0.3),
    segment('Nunca conviene sacrificar la claridad por un efecto que no aporta nada al espectador.', 60, 0.3),
    segment('Un buen montaje elimina las pausas largas y conserva el ritmo natural de la conversación.', 75, 0.3),
    segment('Si el vídeo se entiende sin contexto, ese momento funciona como un short autónomo.', 90, 0.3),
    segment('Los subtítulos deben ser grandes, breves y fáciles de leer incluso en una pantalla pequeña.', 105, 0.3),
    segment('El encuadre vertical puede seguir una cara o quedarse con la zona más importante de la pantalla.', 120, 0.3),
  ];
  const sentences = transcriptSentences(transcript);
  assert.ok(sentences.some(sentence => sentence.text === '¿Esto cómo lo solucionamos?'));
  assert.ok(sentences.every(sentence => !/carpeta$/.test(sentence.text)));
  const plan = planShortMoments(transcript, {sourceDuration: 150, count: 4});
  assert.ok(plan.items.length >= 3 && plan.items.length <= 5);
  assert.equal(new Set(plan.items.map(item => item.hook.toLocaleLowerCase('es'))).size, plan.items.length);
  for (const item of plan.items) {
    assert.ok(item.duration >= 10 && item.duration <= 70);
    assert.ok(item.hook && !/^(?:un ordenador muy bueno\.?|un |una )$/i.test(item.hook));
    assert.ok(!item.text || item.sentence && item.sentence.includes(item.text.slice(0, 10)));
  }
});

test('el hook extractivo conserva la idea y recorta por una frontera natural', () => {
  assert.equal(cleanHook('Y es que esto es importante decirlo, porque cambia todo.'), 'Esto es importante decirlo, porque cambia todo.');
  const long = cleanHook('Esta es una frase muy larga que explica exactamente el problema, con una segunda parte que no cabe en el hook porque el texto continúa demasiado.');
  assert.ok(long.length <= 101);
  assert.ok(!long.includes('  '));
});

test('el reencuadre facial calcula un crop 9:16 y una trayectoria suavizada', () => {
  const samples = Array.from({length: 24}, (_, index) => ({
    t: 100 + index * 0.5,
    face: {x: 0.36 + index * 0.004, y: 0.16, w: 0.18, h: 0.24},
  }));
  const frame = buildReframe({
    width: 1920,
    height: 1080,
    short: {start: 100, end: 136, duration: 36},
    sample: {samples, faces: [], grid: null},
  });
  assert.equal(frame.mode, 'face');
  assert.equal(frame.cropW, 608);
  assert.equal(frame.cropH, 1080);
  assert.match(frame.cropFilter, /^crop=w=608:h=1080:/);
  assert.match(frame.xExpression, /if\(lt\(t,/);
  assert.ok(frame.keyframes.length >= 2);
});

test('si solo hay caras de reacción en la esquina, el encuadre sigue la pantalla', () => {
  const samples = Array.from({length: 12}, (_, index) => ({
    t: index * 0.5,
    face: {x: 0.12, y: 0.76, w: 0.04, h: 0.09},
  }));
  const grid = Array.from({length: 6}, () => Array.from({length: 8}, () => 0));
  for (let row = 0; row < 6; row++) for (let col = 3; col < 6; col++) grid[row][col] = 0.35;
  const frame = buildReframe({
    width: 1920,
    height: 1080,
    short: {start: 0, end: 20, duration: 20},
    sample: {samples, faces: [], grid},
  });
  assert.equal(frame.mode, 'screen');
  assert.match(frame.cropFilter, /crop=w=608:h=1080/);
  assert.equal(frame.keyframes.length, 2);
});

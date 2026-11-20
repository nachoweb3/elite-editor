const FILLER = /^(e+h+|e+m+|m+h+|a+m+|u+h+|h+m+|e+e+|a+h+|o+h+)$/i;

const normalize = value => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, '')
  .trim();

export function isFiller(word) {
  const token = normalize(word);
  return token.length > 0 && token.length <= 6 && FILLER.test(token);
}

// Whisper sometimes repeats one token for seconds over silence or screen noise.
export function sanitizeTranscript(segments) {
  return (segments || []).filter(segment => {
    const words = segment.words || [];
    if (words.length < 12) return true;
    const counts = new Map();
    for (const word of words) {
      const token = normalize(word.word);
      if (!token) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }
    const top = Math.max(0, ...counts.values());
    return !(top >= 8 && top / words.length > 0.55);
  });
}

export function fillerIntervals(segments) {
  const intervals = [];
  for (const segment of segments || []) {
    for (const word of segment.words || []) {
      if (!isFiller(word.word)) continue;
      const start = Math.max(0, Number(word.start) - 0.05);
      const end = Number(word.end) + 0.05;
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      intervals.push({start, end});
    }
  }
  intervals.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end + 0.08) last.end = Math.max(last.end, interval.end);
    else merged.push({...interval});
  }
  return merged;
}

export function removeIntervals(clips, intervals, minimum = 0.16) {
  const result = [];
  for (const clip of clips) {
    let pieces = [{start: clip.start, end: clip.end}];
    for (const interval of intervals) {
      const next = [];
      for (const piece of pieces) {
        if (interval.end <= piece.start || interval.start >= piece.end) {
          next.push(piece);
          continue;
        }
        if (interval.start > piece.start) next.push({start: piece.start, end: Math.min(interval.start, piece.end)});
        if (interval.end < piece.end) next.push({start: Math.max(interval.end, piece.start), end: piece.end});
      }
      pieces = next;
    }
    for (const piece of pieces) {
      if (piece.end - piece.start < minimum) continue;
      result.push({
        ...clip,
        id: String(result.length),
        start: piece.start,
        end: piece.end,
        transitionIn: 'none',
      });
    }
  }
  return result;
}

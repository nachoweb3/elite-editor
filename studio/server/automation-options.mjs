const formats = ['auto', 'vertical', 'horizontal'];

export function resolveAutomationProfile(_media, targetFormat = 'auto') {
  if (!formats.includes(targetFormat)) throw new Error('El formato de montaje no es válido.');
  if (targetFormat === 'vertical') return 'reels';
  if (targetFormat === 'horizontal') return 'youtube';
  return 'source';
}

export function automationOptions(value = {}) {
  const {targetFormat, subtitle, subtitlePosition} = value || {};
  const options = {};
  if (targetFormat !== undefined) {
    if (!formats.includes(targetFormat)) throw new Error('El formato de montaje no es válido.');
    options.targetFormat = targetFormat;
  }
  if (['Cinematic', 'Viral', 'Tutorial', 'Dark Future'].includes(subtitle)) options.subtitle = subtitle;
  if (['top', 'bottom'].includes(subtitlePosition)) options.subtitlePosition = subtitlePosition;
  for (const key of ['subtitles', 'memes', 'broll', 'music', 'beauty']) {
    if (typeof value?.[key] === 'boolean') options[key] = value[key];
  }
  return options;
}

export function resolveAutomationProfile(
  media: {width: number; height: number; rotation?: number},
  targetFormat?: 'auto' | 'horizontal' | 'vertical',
): 'source' | 'youtube' | 'reels';

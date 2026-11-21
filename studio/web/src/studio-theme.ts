export type StudioTheme='cobalt'|'lime';

const storageKey='nacho:studio-theme';

export function readStudioTheme():StudioTheme{
  try{
    if(localStorage.getItem(storageKey)==='lime')return 'lime';
  }catch{}
  return 'cobalt';
}

export function applyStudioTheme(theme:StudioTheme){
  document.documentElement.dataset.studioTheme=theme;
}

export function saveStudioTheme(theme:StudioTheme){
  applyStudioTheme(theme);
  try{localStorage.setItem(storageKey,theme);}catch{}
}

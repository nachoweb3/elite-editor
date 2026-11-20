import {useEffect,useRef,type ReactNode} from 'react';

export type WorkspaceView='editor'|'focus'|'cinema';

const preferenceKey='nacho:workspace-view';

export function initialWorkspaceView():WorkspaceView{
  try{
    const value=localStorage.getItem(preferenceKey);
    if(value==='editor'||value==='focus'||value==='cinema')return value;
    if(localStorage.getItem('nacho:cine')==='1')return 'cinema';
  }catch{}
  return 'editor';
}

export function saveWorkspaceView(view:WorkspaceView){
  try{localStorage.setItem(preferenceKey,view);}catch{}
}

export function StudioHeader({title,status,view,onView,projectActions,children}:{
  title:string;
  status:string;
  view:WorkspaceView;
  onView:(view:WorkspaceView)=>void;
  projectActions:ReactNode;
  children:ReactNode;
}){
  const menu=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{
      if(menu.current?.open&&!menu.current.contains(event.target as Node))menu.current.open=false;
    };
    document.addEventListener('pointerdown',outside);
    return ()=>document.removeEventListener('pointerdown',outside);
  },[]);

  function closeMenu(restoreFocus:boolean){
    if(!menu.current?.open)return;
    menu.current.open=false;
    if(restoreFocus)menu.current.querySelector('summary')?.focus();
  }

  return <header className="nle-header">
    <a href="/?workspace=automatic" className="nle-brand">
      <span className="studio-brand-mark" aria-hidden="true"><i/><i/><i/></span>
      <span>ELITE <b>EDITOR</b><small>ESTUDIO LOCAL</small></span>
    </a>
    <div className="nle-title" title={title}>
      <span>{title}</span><small aria-live="polite">{status}</small>
    </div>
    <div className="studio-header-actions">
      <label className="studio-view-picker">
        <span>Vista</span>
        <select aria-label="Vista del espacio de trabajo" value={view} onChange={event=>onView(event.target.value as WorkspaceView)}>
          <option value="editor">Editor</option>
          <option value="focus">Enfoque</option>
          <option value="cinema">Cine</option>
        </select>
      </label>
      <details ref={menu} className="studio-project-menu" onKeyDown={event=>{
        if(event.key==='Escape'&&event.currentTarget.open){
          event.preventDefault();
          event.stopPropagation();
          closeMenu(true);
        }
      }}>
        <summary>Proyecto <span aria-hidden="true">⌄</span></summary>
        <div className="studio-project-actions" onClick={event=>{
          if(event.target instanceof HTMLElement&&event.target.closest('button,a'))closeMenu(true);
        }}>
          {projectActions}
        </div>
      </details>
      {children}
    </div>
  </header>;
}

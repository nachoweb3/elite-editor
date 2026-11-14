import {Component, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeProvider} from 'next-themes';
import {TooltipProvider} from '@/components/ui/tooltip';
import {Toaster} from '@/components/ui/sonner';
import Projects from '@/app/projects/page';
import Editor from '@/app/editor/[project_id]/page';
import Guide from '@/app/guide/page';
import {usePathname} from './navigation';
import '@/app/globals.css';
import '@/app/xeno.css';
class ErrorBoundary extends Component<{children:ReactNode},{message:string}>{
 state={message:''};
 static getDerivedStateFromError(error:Error){return{message:error.message};}
 render(){return this.state.message?<main className="p-8 space-y-4"><h1>No se pudo abrir el editor</h1><p>{this.state.message}</p><p>Prueba Chrome o Edge actualizado y permite guardar datos en este navegador.</p><button onClick={()=>location.reload()}>Reintentar</button></main>:this.props.children;}
}
function App(){const route=usePathname();return <ThemeProvider attribute="class" defaultTheme="dark"><TooltipProvider><Toaster/><ErrorBoundary key={route}>{route.startsWith('/editor/')?<Editor/>:route==='/guide'?<Guide/>:<Projects/>}</ErrorBoundary></TooltipProvider></ThemeProvider>;}
createRoot(document.getElementById('root')!).render(<App/>);

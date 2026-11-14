import {ThemeProvider} from 'next-themes';
import './globals.css';
import './xeno.css';
import {Toaster} from '../components/ui/sonner';
import {TooltipProvider} from '../components/ui/tooltip';
import {baseMetaData} from './metadata';
export const metadata={...baseMetaData,title:'Elite Editor',description:'Tu historia. Tu montaje. Edición de vídeo con timeline y asistente IA.',icons:{icon:'/elite-mark.svg'},openGraph:{title:'Elite Editor',description:'Edición de vídeo con timeline y asistente IA.'},twitter:{title:'Elite Editor',description:'Edición de vídeo con timeline y asistente IA.'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="es" suppressHydrationWarning><body className="xeno font-sans antialiased"><ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange><TooltipProvider><Toaster/>{children}</TooltipProvider></ThemeProvider></body></html>;}

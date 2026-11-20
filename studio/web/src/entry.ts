const url=new URL(location.href);
if(url.searchParams.has('auto')){
 url.searchParams.delete('auto');
 url.searchParams.set('workspace','automatic');
 history.replaceState(history.state,'',url);
}
if(url.searchParams.has('advanced'))void import('./main');
else void import('./VideoEditor');

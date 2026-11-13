const params=new URLSearchParams(location.search);if(params.has('advanced'))void import('./main');else if(params.has('auto'))void import('./AutoStudio');else void import('./VideoEditor');

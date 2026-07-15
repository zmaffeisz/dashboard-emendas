function aplicarTema(t){document.documentElement.dataset.theme=t;try{localStorage.setItem('tema',t);}catch(e){}}
function alternarTema(){aplicarTema(document.documentElement.dataset.theme==='dark'?'light':'dark');}
aplicarTema((function(){try{return localStorage.getItem('tema');}catch(e){return null;}})()||'dark');

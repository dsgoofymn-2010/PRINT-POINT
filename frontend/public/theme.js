// Single light theme that matches the printer intro video; clear any old saved dark choice.
try { localStorage.removeItem('pp_theme'); document.documentElement.classList.remove('dark'); } catch (e) {}

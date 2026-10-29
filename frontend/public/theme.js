// Single light theme: ink on paper is the brand. Clear any old saved dark choice.
try { localStorage.removeItem('pp_theme'); document.documentElement.classList.remove('dark'); } catch (e) {}

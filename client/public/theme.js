// Applies the saved/system theme before first paint to avoid a flash.
try {
  var t = localStorage.getItem('pp_theme');
  if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark');
} catch (e) {}

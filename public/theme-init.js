// Applies the saved (or system) theme before first paint to avoid a flash of the wrong theme.
(() => {
  let theme = 'dark';
  try {
    const saved = localStorage.getItem('bpm-theme');
    if (saved === 'light' || saved === 'dark') {
      theme = saved;
    } else if (window.matchMedia && !window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'light';
    }
  } catch {
    theme = 'dark';
  }
  document.documentElement.dataset.theme = theme;
})();

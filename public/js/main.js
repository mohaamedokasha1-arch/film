// Public AKASHA HUB Main Scripts
document.addEventListener('DOMContentLoaded', () => {
  // 1. Copy Attribution Button
  const copyBtn = document.getElementById('copy-attribution-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const text = copyBtn.getAttribute('data-text');
      if (text) {
        navigator.clipboard.writeText(text).then(() => {
          const original = copyBtn.innerText;
          copyBtn.innerText = 'Copied!';
          copyBtn.classList.add('btn-primary');
          setTimeout(() => {
            copyBtn.innerText = original;
            copyBtn.classList.remove('btn-primary');
          }, 2000);
        });
      }
    });
  }

  // 2. Poster image fallback
  document.querySelectorAll('img.movie-poster-img').forEach(img => {
    img.addEventListener('error', () => {
      img.src = '/images/placeholder-poster.svg';
    });
  });

  // 3. Search keyboard shortcut ('/' to focus search)
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      const searchInput = document.querySelector('.search-input');
      if (searchInput) searchInput.focus();
    }
  });
});

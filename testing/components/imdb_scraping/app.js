async function fetchMovies() {
  const response = await fetch('/popular_movies.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Impossible de charger le JSON.');
  }

  return response.json();
}

function renderMovies(data) {
  const moviesContainer = document.getElementById('movies');
  const statusText = document.getElementById('statusText');
  const countText = document.getElementById('countText');

  moviesContainer.innerHTML = '';

  const results = Array.isArray(data.results) ? data.results : [];
  statusText.textContent = results.length > 0 ? 'IMDb scraping succeeded.' : 'No movies retrieved.';
  countText.textContent = `${results.length} film(s)`;

  for (const movie of results) {
    const card = document.createElement('a');
    card.className = 'movie-card';
    card.href = movie.url;
    card.target = '_blank';
    card.rel = 'noreferrer';

    const poster = movie.poster || '';
    card.innerHTML = `
      <div class="poster-wrap">
        <img src="${poster}" alt="${movie.name}">
      </div>
      <div class="movie-meta">
        <h2>${movie.rank ? `#${movie.rank} ` : ''}${movie.name}</h2>
        <p>${movie.year ?? 'N/A'} • ${movie.id}</p>
      </div>
    `;

    moviesContainer.appendChild(card);
  }
}

async function refreshMovies() {
  const statusText = document.getElementById('statusText');
  statusText.textContent = 'Refreshing...';

  const response = await fetch('/refresh', { method: 'POST' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Unable to refresh the scraping.');
  }

  const data = await fetchMovies();
  renderMovies(data);
}

document.addEventListener('DOMContentLoaded', async () => {
  const refreshButton = document.getElementById('refreshButton');

  refreshButton.addEventListener('click', async () => {
    refreshButton.disabled = true;
    try {
      await refreshMovies();
    } catch (error) {
      document.getElementById('statusText').textContent = error.message;
    } finally {
      refreshButton.disabled = false;
    }
  });

  try {
    const data = await fetchMovies();
    renderMovies(data);
  } catch (error) {
    document.getElementById('statusText').textContent = error.message;
  }
});
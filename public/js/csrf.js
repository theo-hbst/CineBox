// public/js/csrf.js
//
// Fetches and caches the CSRF token provided by /api/csrf-token, and
// exposes a `csrfFetch` wrapper that automatically adds it as the
// X-CSRF-Token header on state-changing requests (POST/PUT/PATCH/DELETE).
//
// Include on any page that calls a route protected by verifyCsrf
// server-side (everything except /auth).

(function () {
  let cachedToken = null;
  let fetchingPromise = null;

  function getCsrfToken(forceRefresh) {
    if (cachedToken && !forceRefresh) {
      return Promise.resolve(cachedToken);
    }
    if (!fetchingPromise || forceRefresh) {
      fetchingPromise = fetch('/api/csrf-token', { credentials: 'same-origin' })
        .then((res) => res.json())
        .then((data) => {
          cachedToken = data.csrfToken;
          return cachedToken;
        });
    }
    return fetchingPromise;
  }

  function csrfFetch(url, options) {
    options = options || {};
    return getCsrfToken().then((token) => {
      const headers = new Headers(options.headers || {});
      headers.set('X-CSRF-Token', token);

      return fetch(url, Object.assign({}, options, { headers: headers, credentials: 'same-origin' }))
        .then((response) => {
          if (response.status === 403) {
            // The token may have expired/changed: retry once with a fresh token.
            return getCsrfToken(true).then((freshToken) => {
              const retryHeaders = new Headers(options.headers || {});
              retryHeaders.set('X-CSRF-Token', freshToken);
              return fetch(url, Object.assign({}, options, { headers: retryHeaders, credentials: 'same-origin' }));
            });
          }
          return response;
        });
    });
  }

  window.getCsrfToken = getCsrfToken;
  window.csrfFetch = csrfFetch;
})();

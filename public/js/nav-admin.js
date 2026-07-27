// public/js/nav-admin.js
//
// Hides the "Server" menu link if the logged-in user isn't admin.
// Purely cosmetic: real protection happens server-side (requireAdmin
// on GET /public/pages/content/server.html and the /server/* routes).
// Even if someone forced this localStorage flag by hand, they would
// still be blocked by the server.

document.addEventListener('DOMContentLoaded', () => {
  const isAdmin = localStorage.getItem('admin') === '1';
  if (isAdmin) {
    return;
  }

  document.querySelectorAll('a[href="server.html"]').forEach((link) => {
    link.style.display = 'none';
  });
});

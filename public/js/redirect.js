document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('username')) {
        window.location.href = '/';
    }
});
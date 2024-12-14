$(document).ready(function () {
    var username = localStorage.getItem('username');

    if (!username) {
        // User is not logged in, redirect to index.html
        window.location.href = '../index.html';
        alert('Vous devez vous connecter pour accéder à cette page');
    }
});
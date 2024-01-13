$(document).ready(function () {
    var username = localStorage.getItem('username');

    if (!username) {
        // User is not logged in, redirect to index.html
        window.location.href = 'index.html';
    }

    // Rest of your code...
});
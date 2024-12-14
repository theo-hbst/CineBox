$(document).ready(function() {
    // Get the username from local storage
    var username = localStorage.getItem('username') || 'Guest';

    // Display the username in the #username div
    document.getElementById('username').textContent = "Connecté en tant que : " + username;

    // Display the username in the #username-display div
    $('#username-display').text("Connecté en tant que : " + username);
});
// Get the username from local storage
var username = localStorage.getItem('username');

// Display the username on the page
document.getElementById('username-display').textContent = "Connecté en tant que : " + username;
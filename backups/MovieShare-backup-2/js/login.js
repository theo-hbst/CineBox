$(document).ready(function () {
    $('form').submit(function (event) {
        event.preventDefault();

        var usernameInput = $('input[name="login_field"]').val();
        var passwordInput = $('input[name="password_field"]').val();
        // Get the username from the form
        var username = document.querySelector('input[name="login_field"]').value;
        
        $.getJSON('users.json', function (data) {
            // Vérification des identifiants dans les données JSON
            var userFound = data.users.find(function (user) {
                return user.username === usernameInput && user.password === passwordInput;
            });

            if (userFound) {
                localStorage.setItem('username', username);
                window.location.href = 'home.html';
            } else {
                $('input[type=password]').addClass('error');
                setTimeout(function () {
                    alert("Nom d'utilisateur ou mot de passe incorrect.")
                    $('input[type=password]').removeClass('error');
                }, 500);
            }
        })
        .fail(function(jqXHR, textStatus, errorThrown) {
            console.error('Erreur lors du chargement des données JSON:', textStatus, errorThrown);
            alert("Erreur lors du chargement des données JSON. Veuillez vérifier la console pour plus d'informations.");
        });
    });
});

import requests
import itertools

def test_brute_force(url, usernames, passwords):
    for username, password in itertools.product(usernames, passwords):
        try:
            response = requests.post(url, data={'username': username, 'password': password})
            if response.status_code == 200:
                print(f"Successful login with username: {username} and password: {password}")
        except requests.exceptions.RequestException as e:
            print(f"An error occurred: {e}")

# Remplacez 'http://yourserver.com/login' par l'URL de votre serveur
# Remplacez les listes de noms d'utilisateur et de mots de passe par vos propres listes
test_brute_force('http://yourserver.com/login', ['admin', 'root', 'user'], ['password', '123456', 'qwerty'])
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
    print(f"Failed login with username: {username} and password: {password}")
    print(f"Response: {response.text}")
    print(f"Status code: {response.status_code}")

    print('No vulnerabilities found')
# Remplacez 'http://yourserver.com/login' par l'URL de votre serveur
# Remplacez les listes de noms d'utilisateur et de mots de passe par vos propres listes
test_brute_force('http://127.0.0.1:3000', ['admin', 'root', 'user', 'user1', 'user2', 'user3', 'user4', 'user5', 'user6', 'user7', 'user8', 'user9', 'user10', 'user11', 'user12', 'user13', 'user14', 'user15', 'user16', 'user17', 'user18', 'user19', 'user20', 'user21', 'user22', 'user23', 'user24', 'user25', 'user26', 'user27', 'user28', 'user29', 'user30', 'user31', 'user32', 'user33', 'user34', 'user35', 'user36', 'user37', 'user38', 'user39', 'user40', 'user41', 'user42', 'user43', 'user44', 'user45', 'user46', 'user47', 'user48', 'user49', 'user50'], ['password', '123456', 'qwerty', 'user1', 'user2', 'user3', 'user4', 'user5', 'user6', 'user7', 'user8', 'user9', 'user10', 'user11', 'user12', 'user13', 'user14', 'user15', 'user16', 'user17', 'user18', 'user19', 'user20', 'user21', 'user22', 'user23', 'user24', 'user25', 'user26', 'user27', 'user28', 'user29', 'user30', 'user31', 'user32', 'user33', 'user34', 'user35', 'user36', 'user37', 'user38', 'user39', 'user40', 'user41', 'user42', 'user43', 'user44', 'user45', 'user46', 'user47', 'user48', 'user49', 'user50'])
import requests

def test_idor(url, id_range):
    for id in id_range:
        try:
            response = requests.get(f"{url}/{id}")
            if response.status_code == 200:
                print(f"Object with ID {id} is accessible.")
        except requests.exceptions.RequestException as e:
            print(f"An error occurred: {e}")

# Remplacez 'http://yourserver.com/object' par l'URL de votre serveur
# Remplacez range(1, 100) par la plage d'ID que vous voulez tester
test_idor('http://yourserver.com/object', range(1, 100))
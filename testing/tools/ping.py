import requests

def test_server(url):
    try:
        response = requests.get(url)
        print(f"Status Code: {response.status_code}")
        print(f"Headers: {response.headers}")
        print(f"Content: {response.text}")
    except requests.exceptions.RequestException as e:
        print(f"An error occurred: {e}")

# Remplacez 'http://yourserver.com' par l'URL de votre serveur
test_server('http://127.0.0.1:8080/pages/content/home.html')
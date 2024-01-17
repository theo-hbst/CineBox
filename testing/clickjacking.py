import requests

def test_clickjacking(url):
    try:
        response = requests.get(url)
        if 'X-Frame-Options' not in response.headers:
            print("Potential Clickjacking vulnerability detected.")
    except requests.exceptions.RequestException as e:
        print(f"An error occurred: {e}")

# Remplacez 'http://yourserver.com' par l'URL de votre serveur
test_clickjacking('http://yourserver.com')
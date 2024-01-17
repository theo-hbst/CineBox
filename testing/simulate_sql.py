import requests

def test_sql_injection(url, param_dict):
    # SQL Injection payload
    payload = "' OR '1'='1"

    for param in param_dict:
        # Copy original parameters
        injected_param = param_dict.copy()
        # Inject payload
        injected_param[param] += payload
        try:
            response = requests.post(url, data=injected_param)
            if response.status_code == 200:
                print(f"Potential SQL Injection vulnerability detected in parameter: {param}")
        except requests.exceptions.RequestException as e:
            print(f"An error occurred: {e}")

# Remplacez 'http://yourserver.com/form' par l'URL de votre serveur
# Remplacez 'field1' et 'field2' par les noms de vos paramètres
test_sql_injection('http://yourserver.com/form', {'field1': '', 'field2': ''})
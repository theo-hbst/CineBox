import requests

def test_ssrf(url, param_dict):
    # SSRF payload
    payload = "http://localhost/admin"

    for param in param_dict:
        # Copy original parameters
        injected_param = param_dict.copy()
        # Inject payload
        injected_param[param] = payload
        try:
            response = requests.post(url, data=injected_param)
            if response.status_code == 200:
                print(f"Potential SSRF vulnerability detected in parameter: {param}")
        except requests.exceptions.RequestException as e:
            print(f"An error occurred: {e}")

# Remplacez 'http://yourserver.com/form' par l'URL de votre serveur
# Remplacez 'url' par le nom de votre paramètre
test_ssrf('http://yourserver.com/form', {'url': ''})
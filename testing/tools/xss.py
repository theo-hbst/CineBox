import requests

def test_xss(url, param_dict):
    # XSS payload
    payload = "<script>alert('XSS')</script>"

    for param in param_dict:
        # Copy original parameters
        injected_param = param_dict.copy()
        # Inject payload
        injected_param[param] += payload
        try:
            response = requests.post(url, data=injected_param)
            if payload in response.text:
                print(f"Potential XSS vulnerability detected in parameter: {param}")
        except requests.exceptions.RequestException as e:
            print(f"An error occurred: {e}")

# Remplacez 'http://yourserver.com/form' par l'URL de votre serveur
# Remplacez 'field1' et 'field2' par les noms de vos paramètres
test_xss('http://127.0.0.1:8080', {'login_field': '', 'password_field': ''})
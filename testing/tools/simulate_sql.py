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

# Replace 'http://yourserver.com/form' with your server's URL
# Replace 'field1' and 'field2' with your parameter names
test_sql_injection('http://127.0.0.1:3000', {'login_field': '', 'password_field': ''})
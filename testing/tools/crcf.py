import requests

def test_csrf(url, param_dict):
    try:
        # Send POST request without CSRF token
        response = requests.post(url, data=param_dict)
        if response.status_code == 200:
            print("Potential CSRF vulnerability detected.")
    except requests.exceptions.RequestException as e:
        print(f"An error occurred: {e}")

# Replace 'http://yourserver.com/form' with your server's URL
# Replace 'field1' and 'field2' with your parameter names
test_csrf('http://127.0.0.1:3000', {'login_field': 'a', 'password_field': 'a'})
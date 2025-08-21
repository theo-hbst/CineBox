const axios = require('axios');

for (let i = 0; i < 1000; i++) {
  axios.get('http://127.0.0.1:3000') // edit this line to your server's IP address and port
    .catch(error => {
      console.error(error.response.status);
    });
}
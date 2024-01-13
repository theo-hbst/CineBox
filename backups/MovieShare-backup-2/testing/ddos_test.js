const axios = require('axios');

for (let i = 0; i < 1000; i++) {
  axios.get('http://192.168.1.18:8080') // edit this line to your server's IP address and port
    .catch(error => {
      console.error(error.response.status);
    });
}
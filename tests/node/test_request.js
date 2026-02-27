const axios = require('axios');

async function run() {
  try {
    const resp = await axios.post('http://localhost:3000/analyze', {
      text: 'Test analysis from local backend: I feel calm and positive today.'
    }, { timeout: 60000 });
    console.log('STATUS:', resp.status);
    console.log('DATA:', JSON.stringify(resp.data, null, 2));
  } catch (err) {
    if (err.response) {
      console.error('ERROR STATUS:', err.response.status);
      try { console.error('ERROR DATA:', JSON.stringify(err.response.data, null, 2)); } catch(e) { console.error('ERROR DATA (raw):', err.response.data); }
    } else {
      console.error('REQUEST ERROR:', err.message);
    }
    process.exit(1);
  }
}

run();

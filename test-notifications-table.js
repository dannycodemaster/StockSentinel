import fetch from 'node-fetch';

const url = 'https://drsuhwiwpkbshnjvzytu.supabase.co';
const anonKey = 'sb_publishable_s-Hjjy5Rqtmwhkl-0BhBRQ_uwWJAqi7';

async function test() {
  try {
    const response = await fetch(`${url}/rest/v1/notifications?select=*&limit=1`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Response:', text);
  } catch (e) {
    console.error('Error:', e);
  }
}

test();

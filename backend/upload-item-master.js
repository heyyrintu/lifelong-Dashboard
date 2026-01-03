const FormData = require('form-data');
const fs = require('fs');
const http = require('http');

const filePath = 'C:\\Users\\RintuMondal\\Videos\\complete project\\dashboard\\Lifelong Dashboard\\app\\Item master.xlsx';

const form = new FormData();
form.append('file', fs.createReadStream(filePath));

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/inbound/item-master/upload',
  method: 'POST',
  headers: form.getHeaders()
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
    process.exit(0);
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
  process.exit(1);
});

form.pipe(req);

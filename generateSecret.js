// Run this code snippet in Node.js to generate a secure JWT secret
// You can create a file called generate-secret.js with this code

const crypto = require('crypto');

// Generate a random string of 64 hexadecimal characters
const secret = crypto.randomBytes(32).toString('hex');
console.log('JWT Secret:', secret);

// Copy this secret to your .env file as JWT_SECRET
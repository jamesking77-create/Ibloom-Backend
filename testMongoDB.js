//A simple script to test MongoDB Atlas connection
require('dotenv').config();
const mongoose = require('mongoose');

console.log('Attempting to connect to MongoDB Atlas...');
console.log(`Using connection string: ${process.env.MONGODB_URI.replace(/:[^:]*@/, ':****@')}`);

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('MongoDB Atlas Connected Successfully!');
  
  // Create a simple collection and document to test write operations
  const TestSchema = new mongoose.Schema({
    name: String,
    date: { type: Date, default: Date.now }
  });
  
  const Test = mongoose.model('ConnectionTest', TestSchema);
  
  return Test.create({ name: 'MongoDB Atlas Test' });
})
.then(result => {
  console.log('Test document created:', result);
  console.log('Connection and write operations successful!');
  
  // Disconnect after successful test
  return mongoose.disconnect();
})
.then(() => {
  console.log('MongoDB disconnected');
  process.exit(0);
})
.catch(err => {
  console.error('MongoDB Connection Error:', err);
  process.exit(1);
});
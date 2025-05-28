const mongoose = require('mongoose');

const connectDB = async () => {
  let retries = 5;
  while (retries) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        minPoolSize: 5,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      console.log('MongoDB Atlas Connected');

      // Connection Events
      mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err.message, { cause: err.cause });
      });

      mongoose.connection.on('disconnected', () => {
        console.log('MongoDB disconnected');
      });

      // Handle app termination
      process.on('SIGINT', async () => {
        await mongoose.connection.close();
        console.log('MongoDB connection closed due to app termination');
        process.exit(0);
      });

      break; // Exit loop on successful connection
    } catch (err) {
      console.error('MongoDB Atlas Connection Error:', {
        message: err.message,
        cause: err.cause,
        stack: err.stack,
      });
      retries -= 1;
      console.log(`Retries left: ${retries}`);
      if (retries) {
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
      } else {
        process.exit(1);
      }
    }
  }
};

connectDB();

module.exports = connectDB;
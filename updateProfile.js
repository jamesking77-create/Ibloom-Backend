require('dotenv').config(); // Load .env variables

const mongoose = require('mongoose');
const User = require('./models/User'); // Adjust path if needed

async function updateExistingUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected successfully');

    // Data to update for all users
    const updateData = {
      name: 'Username',
      phone: 'phone number',
      location: 'address',
      joinDate: new Date(),
      avatar: '/api/placeholder/150/150',
      bio: 'Software developer with 5 years of experience in React and Node.js. Passionate about building user-friendly interfaces and solving complex problems.',
      specialize: ['Decor', 'Event Planning', 'Catering', 'Rental'],
      categories: [
        { id: 1, name: 'Lightings' },
        { id: 2, name: 'Dance Floor' },
        { id: 3, name: 'Glow Furniture' },
        { id: 4, name: 'LED Inflatables' },
        { id: 5, name: 'Lighted Props' },
        { id: 6, name: 'LED Backdrops' },
        { id: 7, name: 'Centerpieces / Vases' },
        { id: 8, name: 'Table Covers' },
        { id: 9, name: 'Chair Covers' },
        { id: 10, name: 'Bridal Sofas / Chairs' },
        { id: 11, name: 'Walkway Pedestals' },
        { id: 12, name: 'Mandaps' },
        { id: 13, name: 'Drape Aluminium Poles' },
        { id: 14, name: 'Gold Backdrop Panels' },
        { id: 15, name: 'Water Fountain' },
        { id: 16, name: 'Mirror Balls' },
        { id: 17, name: 'Green Mats / Balls' },
        { id: 18, name: 'Lanterns' }
      ],
    };

    // Perform the update
    const result = await User.updateMany({}, { $set: updateData });
    console.log(`✅ ${result.modifiedCount} users updated.`);

  } catch (error) {
    console.error('MongoDB connection or update error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed.');
  }
}

// Run the function
updateExistingUsers();

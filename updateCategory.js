require('dotenv').config(); // Load environment variables from .env
const mongoose = require('mongoose');
const Category = require('./models/Category'); // Adjust the path based on your folder structure

async function updateCategories() {
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('✅ Connected to MongoDB');

  const categoriesData = [
    {
      id: 1,
      name: "Lightings",
      image: "/api/placeholder/300/200",
      description: "Professional lighting equipment for events and venues",
      itemCount: 12,
      items: [
        {
          id: 1,
          name: "LED Strip Lights",
          description: "Flexible LED strips for ambient lighting",
          price: "$25.00",
          image: "/api/placeholder/200/150",
        },
        {
          id: 2,
          name: "Spotlight Set",
          description: "Professional spotlights for stage lighting",
          price: "$150.00",
          image: "/api/placeholder/200/150",
        },
      ],
    },
    {
      id: 2,
      name: "Dance Floor",
      image: "/api/placeholder/300/200",
      description: "High-quality dance floors for all types of events",
      itemCount: 8,
      items: [
        {
          id: 3,
          name: "LED Dance Floor",
          description: "Interactive LED dance floor with color patterns",
          price: "$500.00",
          image: "/api/placeholder/200/150",
        },
      ],
    },
    {
      id: 3,
      name: "Glow Furniture",
      image: "/api/placeholder/300/200",
      description: "Illuminated furniture pieces for modern events",
      itemCount: 15,
      items: [],
    },
  ];

  try {
    // ❗ Optional: Delete existing categories first to avoid duplicates
    await Category.deleteMany({});
    console.log('ℹ️ Existing categories deleted.');

    // Insert the new categories
    const result = await Category.insertMany(categoriesData);
    console.log(`✅ Inserted ${result.length} categories.`);
  } catch (error) {
    console.error('❌ Error inserting categories:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed.');
  }
}

updateCategories();

require('dotenv').config(); 

const mongoose = require('mongoose');
const Order = require('./models/Order'); 
async function seedOrders() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB connected successfully');

    const orders = [
      {
        id: 1,
        orderNumber: 'Order #41489',
        customerInfo: {
          name: 'John Doe',
          email: 'john.doe@email.com',
          phone: '+1 234-567-8900'
        },
        deliveryInfo: {
          type: 'delivery',
          address: '123 Main St, City, State 12345',
          instructions: 'Leave at front door'
        },
        dateInfo: {
          orderDate: new Date('2024-05-27T10:30:00Z'),
          startDate: new Date('2024-05-28T09:00:00Z'),
          endDate: new Date('2024-05-28T18:00:00Z'),
          isMultiDay: false,
          duration: '9 hours'
        },
        items: [
          {
            id: 101,
            name: 'Professional Camera Set',
            category: 'Photography',
            quantity: 2,
            pricePerDay: 150,
            totalPrice: 300,
            image: '/api/placeholder/100/100'
          },
          {
            id: 102,
            name: 'Lighting Kit',
            category: 'Photography',
            quantity: 1,
            pricePerDay: 75,
            totalPrice: 75,
            image: '/api/placeholder/100/100'
          }
        ],
        pricing: {
          subtotal: 375,
          tax: 37.5,
          deliveryFee: 25,
          total: 437.5
        },
        status: 'confirmed',
        termsAccepted: true,
        notes: 'Customer requested early delivery if possible'
      },
      {
        id: 2,
        orderNumber: 'Order #41490',
        customerInfo: {
          name: 'Jane Smith',
          email: 'jane.smith@email.com',
          phone: '+1 234-567-8901'
        },
        deliveryInfo: {
          type: 'warehouse_pickup',
          address: 'Main Warehouse - 456 Industrial Blvd',
          instructions: 'Call upon arrival'
        },
        dateInfo: {
          orderDate: new Date('2024-05-27T14:15:00Z'),
          startDate: new Date('2024-05-29T08:00:00Z'),
          endDate: new Date('2024-05-31T20:00:00Z'),
          isMultiDay: true,
          duration: '3 days'
        },
        items: [
          {
            id: 103,
            name: 'Event Sound System',
            category: 'Audio',
            quantity: 1,
            pricePerDay: 200,
            totalPrice: 600,
            image: '/api/placeholder/100/100'
          },
          {
            id: 104,
            name: 'Wireless Microphones (Set of 4)',
            category: 'Audio',
            quantity: 1,
            pricePerDay: 100,
            totalPrice: 300,
            image: 'https://irukka.com/wp-content/uploads/2020/03/Wireless-Microphone-%E2%80%93-Wharfedale-Aerovocals-1.jpg'
          }
        ],
        pricing: {
          subtotal: 900,
          tax: 90,
          deliveryFee: 0,
          total: 990
        },
        status: 'pending',
        termsAccepted: true,
        notes: ''
      },
      {
        id: 3,
        orderNumber: 'Order #41491',
        customerInfo: {
          name: 'Mike Johnson',
          email: 'mike.j@email.com',
          phone: '+1 234-567-8902'
        },
        deliveryInfo: {
          type: 'delivery',
          address: '789 Oak Avenue, Downtown, State 54321',
          instructions: 'Business address - ask for Mike at reception'
        },
        dateInfo: {
          orderDate: new Date('2024-05-26T16:45:00Z'),
          startDate: new Date('2024-05-27T12:00:00Z'),
          endDate: new Date('2024-05-27T22:00:00Z'),
          isMultiDay: false,
          duration: '10 hours'
        },
        items: [
          {
            id: 105,
            name: 'DJ Equipment Package',
            category: 'Audio',
            quantity: 1,
            pricePerDay: 300,
            totalPrice: 300,
            image: '/api/placeholder/100/100'
          }
        ],
        pricing: {
          subtotal: 300,
          tax: 30,
          deliveryFee: 20,
          total: 350
        },
        status: 'in_progress',
        termsAccepted: true,
        notes: 'Corporate event - handle with extra care'
      }
    ];

    const result = await Order.insertMany(orders);
    console.log(`${result.length} orders seeded`);

  } catch (error) {
    console.error('Error seeding orders:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed.');
  }
}

seedOrders();

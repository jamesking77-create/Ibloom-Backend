// insertBookings.js

require('dotenv').config();
const mongoose = require('mongoose');
const Booking = require('./models/Bookings'); 

const sampleBookings = [
  {
    id: 1,
    customerName: 'Sarah Johnson',
    eventType: 'Wedding Reception',
    startDate: '2024-06-15',
    endDate: '2024-06-15',
    startTime: '18:00',
    endTime: '23:30',
    singleDay: true,
    multiDay: false,
    location: 'Grand Ballroom',
    status: 'pending',
    amount: '₦2,500,000',
    phone: '+234 803 123 4567',
    email: 'sarah.johnson@email.com',
    guests: 150,
    specialRequests: 'Vegetarian options needed, live band setup required',
    paymentStatus: 'partial',
    amountPaid: '₦1,000,000',
    createdAt: '2024-05-20T10:30:00Z',
    items: []
  },
  {
    id: 2,
    customerName: 'Michael Chen',
    eventType: 'Corporate Event',
    startDate: '2024-06-18',
    endDate: '2024-06-19',
    startTime: '14:00',
    endTime: '10:00',
    singleDay: false,
    multiDay: true,
    location: 'Conference Center',
    status: 'confirmed',
    amount: '₦1,800,000',
    phone: '+234 807 987 6543',
    email: 'michael.chen@company.com',
    guests: 80,
    specialRequests: 'AV equipment, projector setup',
    paymentStatus: 'paid',
    amountPaid: '₦1,800,000',
    createdAt: '2024-05-18T14:15:00Z',
    items: []
  },
  {
    id: 3,
    customerName: 'Emily Rodriguez',
    eventType: 'Birthday Party',
    startDate: '2024-06-20',
    endDate: '2024-06-20',
    startTime: '16:00',
    endTime: '20:00',
    singleDay: true,
    multiDay: false,
    location: 'Garden Pavilion',
    status: 'pending',
    amount: '₦950,000',
    phone: '+234 901 456 7890',
    email: 'emily.rodriguez@email.com',
    guests: 45,
    specialRequests: 'Birthday cake, decorations in pink theme',
    paymentStatus: 'unpaid',
    amountPaid: '₦0',
    createdAt: '2024-05-22T09:45:00Z',
    items: []
  },
  {
    id: 4,
    customerName: 'David Thompson',
    eventType: 'Anniversary Dinner',
    startDate: '2024-06-22',
    endDate: '2024-06-22',
    startTime: '19:00',
    endTime: '22:00',
    singleDay: true,
    multiDay: false,
    location: 'Private Dining',
    status: 'confirmed',
    amount: '₦1,200,000',
    phone: '+234 805 234 5678',
    email: 'david.thompson@email.com',
    guests: 12,
    specialRequests: 'Romantic setup, wine pairing',
    paymentStatus: 'paid',
    amountPaid: '₦1,200,000',
    createdAt: '2024-05-19T16:20:00Z',
    items: []
  },
  {
    id: 5,
    customerName: 'Lisa Wang',
    eventType: 'Baby Shower',
    startDate: '2024-06-25',
    endDate: '2024-06-25',
    startTime: '15:00',
    endTime: '18:00',
    singleDay: true,
    multiDay: false,
    location: 'Garden Pavilion',
    status: 'pending',
    amount: '₦750,000',
    phone: '+234 809 876 5432',
    email: 'lisa.wang@email.com',
    guests: 35,
    specialRequests: 'Baby shower decorations, non-alcoholic beverages only',
    paymentStatus: 'partial',
    amountPaid: '₦300,000',
    createdAt: '2024-05-21T11:30:00Z',
    items: []
  },
  {
    id: 6,
    customerName: 'James Wilson',
    eventType: 'Conference Summit',
    startDate: '2024-06-28',
    endDate: '2024-06-30',
    startTime: '09:00',
    endTime: '17:00',
    singleDay: false,
    multiDay: true,
    location: 'Main Convention Hall',
    status: 'confirmed',
    amount: '₦4,500,000',
    phone: '+234 805 111 2222',
    email: 'james.wilson@conference.com',
    guests: 300,
    specialRequests: 'Full AV setup, catering for 3 days, accommodation assistance',
    paymentStatus: 'partial',
    amountPaid: '₦2,250,000',
    createdAt: '2024-05-25T08:00:00Z',
    items: []
  },
  {
    id: 7,
    customerName: 'Maria Santos',
    eventType: 'Art Exhibition Opening',
    startDate: '2024-07-02',
    endDate: '2024-07-03',
    startTime: '19:00',
    endTime: '02:00',
    singleDay: false,
    multiDay: true,
    location: 'Gallery Wing',
    status: 'pending',
    amount: '₦1,350,000',
    phone: '+234 809 333 4444',
    email: 'maria.santos@artgallery.com',
    guests: 120,
    specialRequests: 'Special lighting, wine service, art handling equipment',
    paymentStatus: 'unpaid',
    amountPaid: '₦0',
    createdAt: '2024-05-28T12:00:00Z',
    items: []
  }
];

const start = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    const inserted = await Booking.insertMany(sampleBookings);
    console.log(`Inserted ${inserted.length} bookings`);

    process.exit();
  } catch (err) {
    console.error('Error inserting bookings:', err.message);
    process.exit(1);
  }
};

start();

// // In your backend routes
// app.get('/api/company/info', async (req, res) => {
//   try {
//     // Get the admin user (assuming only one admin exists)
//     const adminUser = await User.findOne({ role: 'user' });
    
//     if (!adminUser) {
//       return res.status(404).json({ 
//         success: false, 
//         message: 'Company information not found' 
//       });
//     }

//     // Return only public company information
//     const companyInfo = {
//       name: adminUser.name,
//       bio: adminUser.bio,
//       location: adminUser.location,
//       phone: adminUser.phone,
//       email: adminUser.email,
//       avatar: adminUser.avatar,
//       specialize: adminUser.specialize,
//       categories: adminUser.categories,
//       joinDate: adminUser.joinDate
//     };

//     res.status(200).json({
//       success: true,
//       data: { company: companyInfo }
//     });
//   } catch (error) {
//     res.status(500).json({ 
//       success: false, 
//       message: 'Failed to fetch company information' 
//     });
//   }
// });
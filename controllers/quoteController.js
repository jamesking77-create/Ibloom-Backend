// controllers/quoteController.js - FIXED VERSION with Proper ID Handling
const Quote = require('../models/quoteModel');
const { generateQuotePDF } = require('../utils/pdfGenerator');
const { sendQuoteEmail } = require('../utils/emailService');

// Helper function to check if a string is a valid MongoDB ObjectId
const isValidObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

// Helper function to build query for finding quotes by ID
const buildQuoteQuery = (quoteId) => {
  // If it's a valid ObjectId, search by _id, otherwise search by quoteId
  if (isValidObjectId(quoteId)) {
    return { _id: quoteId };
  } else {
    return { quoteId: quoteId };
  }
};

// Helper function to generate unique quote ID
const generateQuoteId = async () => {
  const year = new Date().getFullYear();
  let isUnique = false;
  let quoteId;
  let counter = 1;

  while (!isUnique) {
    // Format: QR-2024-001, QR-2024-002, etc.
    const paddedCounter = String(counter).padStart(3, '0');
    quoteId = `QR-${year}-${paddedCounter}`;
    
    // Check if this ID already exists
    const existingQuote = await Quote.findOne({ quoteId });
    if (!existingQuote) {
      isUnique = true;
    } else {
      counter++;
    }
  }
  
  return quoteId;
};

// Create new quote (Public endpoint)
exports.createQuote = async (req, res) => {
  try {
    console.log('📝 Creating new quote request:', req.body);

    const {
      customer,
      categoryId,
      categoryName,
      items,
      adminNotes
    } = req.body;

    // Validation
    if (!customer || !customer.name || !customer.email || !customer.phone) {
      return res.status(400).json({
        success: false,
        message: 'Customer information (name, email, phone) is required'
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one item is required'
      });
    }

    if (!categoryName) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required'
      });
    }

    // Generate unique quote ID
    const quoteId = await generateQuoteId();
    console.log('🆔 Generated quote ID:', quoteId);

    // Create quote with all required fields
    const quote = new Quote({
      quoteId,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address || '',
        company: customer.company || '',
        eventType: customer.eventType || '',
        eventDate: customer.eventDate || null,
        eventLocation: customer.eventLocation || '',
        guestCount: customer.guestCount || null,
        eventDuration: customer.eventDuration || '',
        venue: customer.venue || '',
        specialRequests: customer.specialRequests || '',
        budget: customer.budget || '',
        hearAboutUs: customer.hearAboutUs || '',
        preferredContact: customer.preferredContact || 'phone',
        contactTime: customer.contactTime || 'anytime'
      },
      categoryId: categoryId || null,
      categoryName,
      items: items.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description || '',
        image: item.image || '',
        quantity: item.quantity || 1,
        unitPrice: 0,
        totalPrice: 0
      })),
      adminNotes: adminNotes || '',
      status: 'pending',
      viewedByAdmin: false,
      totalItems: items.length,
      communications: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await quote.save();

    console.log('✅ Quote created successfully:', quote.quoteId);

    // WebSocket notification
    try {
      if (global.emitQuoteNotification) {
        global.emitQuoteNotification('new_quote', {
          _id: quote._id,
          quoteId: quote.quoteId,
          customer: {
            name: quote.customer.name,
            email: quote.customer.email,
            phone: quote.customer.phone
          },
          categoryName: quote.categoryName,
          totalItems: quote.totalItems,
          status: quote.status,
          createdAt: quote.createdAt,
          viewedByAdmin: quote.viewedByAdmin
        });
      } else if (global.io) {
        global.io.emit('quote_notification', {
          type: 'new_quote',
          module: 'quotes',
          data: {
            _id: quote._id,
            quoteId: quote.quoteId,
            customer: {
              name: quote.customer.name,
              email: quote.customer.email,
              phone: quote.customer.phone
            },
            categoryName: quote.categoryName,
            totalItems: quote.totalItems,
            status: quote.status,
            createdAt: quote.createdAt,
            viewedByAdmin: quote.viewedByAdmin
          }
        });
      }
      console.log('📡 WebSocket notification sent for new quote');
    } catch (wsError) {
      console.error('❌ WebSocket notification failed:', wsError);
    }

    // Send confirmation email to customer
    try {
      if (sendQuoteEmail && sendQuoteEmail.sendConfirmation) {
        await sendQuoteEmail.sendConfirmation(quote);
        console.log('📧 Confirmation email sent to customer');
      }
    } catch (emailError) {
      console.error('❌ Confirmation email failed:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Quote request submitted successfully',
      data: {
        _id: quote._id,
        quoteId: quote.quoteId,
        status: quote.status,
        customer: {
          name: quote.customer.name,
          email: quote.customer.email,
          phone: quote.customer.phone
        },
        categoryName: quote.categoryName,
        totalItems: quote.totalItems,
        createdAt: quote.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Create quote error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create quote request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all quotes with filtering and pagination
exports.getAllQuotes = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      categoryName,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (categoryName) {
      filter.categoryName = categoryName;
    }

    if (search) {
      filter.$or = [
        { quoteId: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'customer.email': { $regex: search, $options: 'i' } },
        { 'customer.phone': { $regex: search, $options: 'i' } },
        { 'customer.eventType': { $regex: search, $options: 'i' } }
      ];
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const [quotes, totalCount] = await Promise.all([
      Quote.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Quote.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalCount / parseInt(limit));

    console.log(`📊 Retrieved ${quotes.length} quotes (page ${page} of ${totalPages})`);

    res.status(200).json({
      success: true,
      data: quotes,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCount,
        limit: parseInt(limit),
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('❌ Get quotes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve quotes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get specific quote by ID
exports.getQuoteById = async (req, res) => {
  try {
    const { quoteId } = req.params;

    console.log('🔍 Looking for quote with ID:', quoteId);

    // Build query based on ID type
    const query = buildQuoteQuery(quoteId);
    console.log('🔍 Using query:', query);

    const quote = await Quote.findOne(query);

    if (!quote) {
      console.log('❌ Quote not found with ID:', quoteId);
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    console.log(`📋 Retrieved quote: ${quote.quoteId}`);

    res.status(200).json({
      success: true,
      data: quote
    });

  } catch (error) {
    console.error('❌ Get quote by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve quote',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update quote status
exports.updateQuoteStatus = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { status } = req.body;

    console.log('🔄 Updating quote status:', quoteId, 'to', status);

    const validStatuses = ['pending', 'reviewed', 'responded', 'accepted', 'cancelled', 'expired'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    // Build query based on ID type
    const query = buildQuoteQuery(quoteId);
    console.log('🔍 Using query for update:', query);

    const quote = await Quote.findOne(query);

    if (!quote) {
      console.log('❌ Quote not found for status update:', quoteId);
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    const oldStatus = quote.status;
    quote.status = status;
    quote.updatedAt = new Date();
    
    if (status === 'responded') {
      quote.respondedAt = new Date();
    }

    await quote.save();

    console.log(`🔄 Status updated: ${quote.quoteId} (${oldStatus} → ${status})`);

    // WebSocket notification
    try {
      if (global.emitQuoteNotification) {
        global.emitQuoteNotification('quote_status_updated', {
          quoteId: quote.quoteId,
          _id: quote._id,
          oldStatus,
          newStatus: status,
          updatedAt: quote.updatedAt
        });
      } else if (global.io) {
        global.io.emit('quote_notification', {
          type: 'quote_status_updated',
          module: 'quotes',
          data: {
            quoteId: quote.quoteId,
            _id: quote._id,
            oldStatus,
            newStatus: status,
            updatedAt: quote.updatedAt
          }
        });
      }
    } catch (wsError) {
      console.error('❌ WebSocket notification failed:', wsError);
    }

    res.status(200).json({
      success: true,
      message: 'Quote status updated successfully',
      data: {
        _id: quote._id,
        quoteId: quote.quoteId,
        oldStatus,
        newStatus: status,
        updatedAt: quote.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Update status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update quote status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Mark quote as viewed
exports.markAsViewed = async (req, res) => {
  try {
    const { quoteId } = req.params;

    console.log('👁️ Marking quote as viewed:', quoteId);

    // Build query based on ID type
    const query = buildQuoteQuery(quoteId);

    const quote = await Quote.findOne(query);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    if (!quote.viewedByAdmin) {
      quote.viewedByAdmin = true;
      quote.viewedAt = new Date();
      quote.updatedAt = new Date();
      await quote.save();
      
      console.log(`👁️ Quote marked as viewed: ${quote.quoteId}`);
    }

    res.status(200).json({
      success: true,
      message: 'Quote marked as viewed',
      data: {
        _id: quote._id,
        quoteId: quote.quoteId,
        viewedAt: quote.viewedAt
      }
    });

  } catch (error) {
    console.error('❌ Mark as viewed error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark quote as viewed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create quote response
exports.createQuoteResponse = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const {
      message,
      items,
      subtotal,
      discount = 0,
      tax = 0,
      deliveryFee = 0,
      setupFee = 0,
      finalTotal,
      validUntil,
      terms
    } = req.body;

    console.log('📝 Creating quote response for:', quoteId);

    // Build query based on ID type
    const query = buildQuoteQuery(quoteId);

    const quote = await Quote.findOne(query);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    // Update items with pricing
    if (items && Array.isArray(items)) {
      quote.items = items.map(item => ({
        ...item,
        unitPrice: item.unitPrice || 0,
        totalPrice: (item.unitPrice || 0) * (item.quantity || 1)
      }));
    }

    // Calculate totals
    const calculatedSubtotal = subtotal || quote.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    const discountAmount = discount || 0;
    const taxAmount = tax || 0;
    const deliveryAmount = deliveryFee || 0;
    const setupAmount = setupFee || 0;
    
    const totalAmount = finalTotal || (calculatedSubtotal - discountAmount + taxAmount + deliveryAmount + setupAmount);

    // Create response
    quote.response = {
      message: message || '',
      totalAmount,
      subtotal: calculatedSubtotal,
      discount: discountAmount,
      tax: taxAmount,
      deliveryFee: deliveryAmount,
      setupFee: setupAmount,
      finalTotal: totalAmount,
      validUntil: validUntil ? new Date(validUntil) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      terms: terms || '',
      createdBy: req.user?._id || null,
      createdAt: new Date()
    };

    quote.status = 'responded';
    quote.respondedAt = new Date();
    quote.updatedAt = new Date();

    await quote.save();

    console.log(`📝 Quote response created: ${quote.quoteId}`);

    // WebSocket notification
    try {
      if (global.emitQuoteNotification) {
        global.emitQuoteNotification('quote_response_created', {
          _id: quote._id,
          quoteId: quote.quoteId,
          response: quote.response,
          status: quote.status,
          respondedAt: quote.respondedAt
        });
      } else if (global.io) {
        global.io.emit('quote_notification', {
          type: 'quote_response_created',
          module: 'quotes',
          data: {
            _id: quote._id,
            quoteId: quote.quoteId,
            response: quote.response,
            status: quote.status,
            respondedAt: quote.respondedAt
          }
        });
      }
    } catch (wsError) {
      console.error('❌ WebSocket notification failed:', wsError);
    }

    res.status(201).json({
      success: true,
      message: 'Quote response created successfully',
      data: quote.response
    });

  } catch (error) {
    console.error('❌ Create quote response error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create quote response',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update quote response
exports.updateQuoteResponse = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const updates = req.body;

    console.log('📝 Updating quote response for:', quoteId);

    // Build query based on ID type
    const query = buildQuoteQuery(quoteId);

    const quote = await Quote.findOne(query);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    if (!quote.response) {
      return res.status(400).json({
        success: false,
        message: 'Quote response does not exist'
      });
    }

    // Update response fields
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        quote.response[key] = updates[key];
      }
    });

    quote.updatedAt = new Date();
    await quote.save();

    console.log(`📝 Quote response updated: ${quote.quoteId}`);

    res.status(200).json({
      success: true,
      message: 'Quote response updated successfully',
      data: quote.response
    });

  } catch (error) {
    console.error('❌ Update quote response error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update quote response',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Send quote response via email
exports.sendQuoteResponse = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { 
      includeTerms = true,
      customMessage = '',
      generatePDF = true 
    } = req.body;

    console.log('📧 Sending quote response for:', quoteId);

    // Build query based on ID type
    const query = buildQuoteQuery(quoteId);

    const quote = await Quote.findOne(query);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    if (!quote.response) {
      return res.status(400).json({
        success: false,
        message: 'Quote response not created yet'
      });
    }

    let pdfBuffer = null;
    let pdfUrl = null;

    // Generate PDF if requested
    if (generatePDF && generateQuotePDF) {
      try {
        pdfBuffer = await generateQuotePDF(quote);
        pdfUrl = `/quotes/${quote.quoteId}.pdf`;
        
        quote.response.pdfGenerated = true;
        quote.response.pdfUrl = pdfUrl;
        await quote.save();
        
        console.log(`📄 PDF generated for quote: ${quote.quoteId}`);
      } catch (pdfError) {
        console.error('❌ PDF generation failed:', pdfError);
      }
    }

    // Check customer's preferred contact method
    const preferredContact = quote.customer.preferredContact;
    
    if (preferredContact === 'email' && sendQuoteEmail && sendQuoteEmail.sendQuoteResponse) {
      try {
        await sendQuoteEmail.sendQuoteResponse(quote, {
          customMessage,
          includeTerms,
          pdfBuffer
        });
        
        console.log(`📧 Quote email sent to: ${quote.customer.email}`);
        
        // Log communication
        if (!quote.communications) {
          quote.communications = [];
        }
        quote.communications.push({
          type: 'email',
          message: `Quote response sent via email${customMessage ? ': ' + customMessage : ''}`,
          sentBy: req.user?._id || null,
          timestamp: new Date()
        });
        
        quote.updatedAt = new Date();
        await quote.save();
        
        res.status(200).json({
          success: true,
          message: 'Quote response sent via email successfully',
          data: {
            method: 'email',
            recipient: quote.customer.email,
            pdfGenerated: !!pdfBuffer
          }
        });
        
      } catch (emailError) {
        console.error('❌ Email sending failed:', emailError);
        throw emailError;
      }
    } else {
      // For phone or WhatsApp, provide manual instructions
      const contactInstructions = {
        phone: `Call customer at ${quote.customer.phone}`,
        whatsapp: `Send WhatsApp message to ${quote.customer.phone}`
      };
      
      // Log the manual contact requirement
      if (!quote.communications) {
        quote.communications = [];
      }
      quote.communications.push({
        type: preferredContact,
        message: `Manual contact required via ${preferredContact}: ${contactInstructions[preferredContact]}`,
        sentBy: req.user?._id || null,
        timestamp: new Date()
      });
      
      quote.updatedAt = new Date();
      await quote.save();
      
      res.status(200).json({
        success: true,
        message: `Quote response prepared. Manual ${preferredContact} contact required.`,
        data: {
          method: preferredContact,
          instructions: contactInstructions[preferredContact],
          customerPhone: quote.customer.phone,
          preferredTime: quote.customer.contactTime,
          pdfGenerated: !!pdfBuffer,
          pdfUrl: pdfUrl,
          quoteDetails: {
            total: quote.response.finalTotal,
            validUntil: quote.response.validUntil,
            message: quote.response.message
          }
        }
      });
    }

  } catch (error) {
    console.error('❌ Send quote response error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send quote response',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Add communication log
exports.addCommunication = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { type, message } = req.body;

    const validTypes = ['email', 'phone', 'whatsapp', 'note'];
    
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid communication type'
      });
    }

    // Build query based on ID type
    const query = buildQuoteQuery(quoteId);

    const quote = await Quote.findOne(query);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    if (!quote.communications) {
      quote.communications = [];
    }

    const communication = {
      type,
      message,
      sentBy: req.user?._id || null,
      timestamp: new Date()
    };

    quote.communications.push(communication);
    quote.updatedAt = new Date();

    await quote.save();

    console.log(`💬 Communication added to quote: ${quote.quoteId}`);

    res.status(201).json({
      success: true,
      message: 'Communication logged successfully',
      data: communication
    });

  } catch (error) {
    console.error('❌ Add communication error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add communication',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete quote
exports.deleteQuote = async (req, res) => {
  try {
    const { quoteId } = req.params;

    console.log('🗑️ Deleting quote:', quoteId);

    // Build query based on ID type
    const query = buildQuoteQuery(quoteId);

    const quote = await Quote.findOneAndDelete(query);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    console.log(`🗑️ Quote deleted: ${quote.quoteId}`);

    // WebSocket notification
    try {
      if (global.emitQuoteNotification) {
        global.emitQuoteNotification('quote_deleted', {
          _id: quote._id,
          quoteId: quote.quoteId,
          customerName: quote.customer.name
        });
      } else if (global.io) {
        global.io.emit('quote_notification', {
          type: 'quote_deleted',
          module: 'quotes',
          data: {
            _id: quote._id,
            quoteId: quote.quoteId,
            customerName: quote.customer.name
          }
        });
      }
    } catch (wsError) {
      console.error('❌ WebSocket notification failed:', wsError);
    }

    res.status(200).json({
      success: true,
      message: 'Quote deleted successfully',
      data: {
        _id: quote._id,
        quoteId: quote.quoteId,
        customerName: quote.customer.name
      }
    });

  } catch (error) {
    console.error('❌ Delete quote error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete quote',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get quote statistics
exports.getQuoteStats = async (req, res) => {
  try {
    const [
      totalQuotes,
      pendingQuotes,
      reviewedQuotes,
      respondedQuotes,
      acceptedQuotes,
      cancelledQuotes,
      expiredQuotes,
      recentQuotes,
      unviewedQuotes
    ] = await Promise.all([
      Quote.countDocuments(),
      Quote.countDocuments({ status: 'pending' }),
      Quote.countDocuments({ status: 'reviewed' }),
      Quote.countDocuments({ status: 'responded' }),
      Quote.countDocuments({ status: 'accepted' }),
      Quote.countDocuments({ status: 'cancelled' }),
      Quote.countDocuments({ status: 'expired' }),
      Quote.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('quoteId customer.name status createdAt categoryName')
        .lean(),
      Quote.countDocuments({ viewedByAdmin: false })
    ]);

    const stats = {
      total: totalQuotes,
      byStatus: {
        pending: pendingQuotes,
        reviewed: reviewedQuotes,
        responded: respondedQuotes,
        accepted: acceptedQuotes,
        cancelled: cancelledQuotes,
        expired: expiredQuotes
      },
      recent: recentQuotes,
      unviewed: unviewedQuotes
    };

    console.log('📊 Quote statistics retrieved');

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Get quote stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve quote statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Verify quote (Public endpoint for customer)
exports.verifyQuote = async (req, res) => {
  try {
    const { quoteId } = req.params;

    const quote = await Quote.findOne({ quoteId })
      .select('quoteId customer.name status createdAt response.totalAmount response.validUntil')
      .lean();

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        quoteId: quote.quoteId,
        customerName: quote.customer.name,
        status: quote.status,
        createdAt: quote.createdAt,
        hasResponse: !!quote.response,
        totalAmount: quote.response?.totalAmount,
        validUntil: quote.response?.validUntil
      }
    });

  } catch (error) {
    console.error('❌ Verify quote error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify quote',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Export quotes
exports.exportQuotes = async (req, res) => {
  try {
    const { format = 'csv', status, dateFrom, dateTo } = req.query;

    // Build filter
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const quotes = await Quote.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    if (format === 'csv') {
      const csv = convertToCSV(quotes);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=quotes.csv');
      res.send(csv);
    } else {
      res.status(200).json({
        success: true,
        data: quotes,
        count: quotes.length
      });
    }

  } catch (error) {
    console.error('❌ Export quotes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export quotes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Helper function to convert quotes to CSV
function convertToCSV(quotes) {
  const headers = [
    'Quote ID',
    'Customer Name',
    'Email',
    'Phone',
    'Event Type',
    'Category',
    'Status',
    'Total Items',
    'Total Amount',
    'Created At'
  ];

  const rows = quotes.map(quote => [
    quote.quoteId,
    quote.customer.name,
    quote.customer.email,
    quote.customer.phone,
    quote.customer.eventType || '',
    quote.categoryName,
    quote.status,
    quote.totalItems || quote.items?.length || 0,
    quote.response?.finalTotal || '',
    new Date(quote.createdAt).toISOString()
  ]);

  return [headers, ...rows]
    .map(row => row.map(field => `"${field}"`).join(','))
    .join('\n');
}
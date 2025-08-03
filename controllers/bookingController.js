const Booking = require("../models/Bookings");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// Import WebSocket server
const bookingWebSocketServer = require("../webSocket/bookingWebSocket");

// Email configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Admin notification email addresses
const ADMIN_EMAILS = [process.env.ADMIN_EMAIL || "admin@youreventcompany.com"];

// FIXED: Helper function to get logo - supports both URL and local paths
const getLogoBase64 = async () => {
  // Option 1: Try Cloudinary URL first (RECOMMENDED)
  const CLOUDINARY_LOGO_URL = process.env.CLOUDINARY_LOGO_URL || "https://res.cloudinary.com/your-cloud-name/image/upload/v1234567890/ibloomcut.png";
  
  try {
    if (CLOUDINARY_LOGO_URL && CLOUDINARY_LOGO_URL.startsWith("http")) {
      console.log("Trying to load logo from Cloudinary URL:", CLOUDINARY_LOGO_URL);
      const https = require('https');
      const http = require('http');
      
      return new Promise((resolve, reject) => {
        const client = CLOUDINARY_LOGO_URL.startsWith('https:') ? https : http;
        
        client.get(CLOUDINARY_LOGO_URL, (response) => {
          if (response.statusCode === 200) {
            const data = [];
            response.on('data', chunk => data.push(chunk));
            response.on('end', () => {
              const buffer = Buffer.concat(data);
              console.log("Logo loaded successfully from Cloudinary, size:", buffer.length, "bytes");
              resolve(`data:image/png;base64,${buffer.toString("base64")}`);
            });
          } else {
            console.log("Failed to load from Cloudinary, status:", response.statusCode);
            resolve(tryLocalLogoPaths()); // Fallback to local
          }
        }).on('error', (error) => {
          console.error("Error loading from Cloudinary:", error);
          resolve(tryLocalLogoPaths()); // Fallback to local
        });
      });
    }
  } catch (error) {
    console.error("Error with Cloudinary URL:", error);
  }

  // Fallback to local file system
  return tryLocalLogoPaths();
};

// Helper function to try local logo paths
const tryLocalLogoPaths = () => {
  const possiblePaths = [
    path.join(__dirname, "../../assets/ibloomcut.png"),
    path.join(__dirname, "../assets/ibloomcut.png"),
    path.join(__dirname, "../../public/assets/ibloomcut.png"),
    path.join(__dirname, "../public/assets/ibloomcut.png"),
    path.join(process.cwd(), "assets/ibloomcut.png"),
    path.join(process.cwd(), "public/assets/ibloomcut.png")
  ];

  for (const logoPath of possiblePaths) {
    try {
      console.log("Trying local logo path:", logoPath);
      console.log("Logo file exists:", fs.existsSync(logoPath));

      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        console.log("Logo loaded successfully from local path, size:", logoBuffer.length, "bytes");
        return `data:image/png;base64,${logoBuffer.toString("base64")}`;
      }
    } catch (error) {
      console.error("Failed to load logo from path:", logoPath, error);
      continue;
    }
  }

  console.log("No logo found in any of the attempted paths");
  return null;
};

// Helper function to format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(amount);
};

// Helper function to calculate formatted prices
const calculateFormattedPricing = (itemsSubtotal, taxRate = 0.075) => {
  const taxAmount = itemsSubtotal * taxRate;
  const totalAmount = itemsSubtotal + taxAmount;

  return {
    itemsSubtotal,
    taxAmount,
    totalAmount,
    formatted: {
      subtotal: formatCurrency(itemsSubtotal),
      tax: formatCurrency(taxAmount),
      total: formatCurrency(totalAmount),
    },
  };
};

// Get all bookings
const getBookings = async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });

    const pagination = {
      currentPage: 1,
      totalPages: Math.ceil(bookings.length / 10),
      totalItems: bookings.length,
      itemsPerPage: 10,
    };

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const thisWeekBookings = bookings.filter(
      (b) => new Date(b.createdAt) >= oneWeekAgo
    );
    const thisMonthBookings = bookings.filter(
      (b) => new Date(b.createdAt) >= oneMonthAgo
    );

    const totalRevenue = bookings
      .filter((b) => b.status === "confirmed")
      .reduce((acc, b) => {
        const amount =
          b.pricing?.totalAmount ||
          parseFloat(b.amount?.replace(/[₦,]/g, "") || 0);
        return acc + amount;
      }, 0);

    const stats = {
      thisWeek: thisWeekBookings.length,
      thisMonth: thisMonthBookings.length,
      totalRevenue: totalRevenue,
    };

    res.status(200).json({ bookings, pagination, stats });
  } catch (error) {
    console.error("Get bookings error:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch bookings", error: error.message });
  }
};

// Create a new booking - UPDATED with WebSocket notification
const createBooking = async (req, res) => {
  try {
    console.log(
      "Creating booking with data:",
      JSON.stringify(req.body, null, 2)
    );

    if (!req.body || Object.keys(req.body).length === 0) {
      console.error("❌ Request body is empty or undefined");
      return res.status(400).json({
        message: "Request body is empty or malformed",
        received: req.body,
      });
    }

    const { customer, eventSchedule, services, pricing } = req.body;

    if (
      !customer?.personalInfo?.name ||
      !customer?.personalInfo?.email ||
      !customer?.personalInfo?.phone
    ) {
      return res.status(400).json({
        message: "Missing required customer information",
      });
    }

    if (!eventSchedule?.startDate || !eventSchedule?.endDate) {
      return res.status(400).json({
        message: "Missing required event schedule information",
      });
    }

    if (!services || services.length === 0) {
      return res.status(400).json({
        message: "At least one service must be selected",
      });
    }

    // Generate unique booking ID if not provided
    if (!req.body.bookingId) {
      req.body.bookingId = "BK" + Date.now().toString().slice(-6);
    }

    // Ensure proper pricing calculation
    if (pricing) {
      const calculatedPricing = calculateFormattedPricing(
        pricing.itemsSubtotal || 0,
        pricing.taxRate || 0.075
      );
      req.body.pricing = {
        ...pricing,
        ...calculatedPricing,
        totalItems: services.reduce(
          (sum, service) => sum + service.quantity,
          0
        ),
        totalServices: services.length,
        currency: pricing.currency || "NGN",
      };
    }

    // Set validation flags
    req.body.validation = {
      hasCustomerInfo: !!(
        customer?.personalInfo?.name && customer?.personalInfo?.email
      ),
      hasEventSchedule: !!(eventSchedule?.startDate && eventSchedule?.endDate),
      hasServices: services && services.length > 0,
      hasPricing: !!pricing?.totalAmount,
    };

    // Set business data defaults
    req.body.businessData = {
      ...req.body.businessData,
      deliveryRequired: customer?.eventDetails?.delivery === "yes",
      setupRequired: customer?.eventDetails?.installation === "yes",
    };

    // Create the booking
    const booking = new Booking(req.body);
    await booking.save();

    console.log("Booking created successfully:", booking._id);

    // 🔔 EMIT WEBSOCKET NOTIFICATION FOR NEW BOOKING
    try {
      bookingWebSocketServer.emitNewBooking(booking);
      console.log("✅ WebSocket notification sent for new booking:", booking.bookingId);
    } catch (wsError) {
      console.error("❌ Failed to send WebSocket notification:", wsError);
      // Don't fail the request if WebSocket fails
    }

    // Send emails in parallel (don't block the response)
    const emailPromises = [
      sendBookingConfirmationEmail(booking),
      sendAdminNotificationEmail(booking),
    ];

    Promise.all(emailPromises)
      .then(() => {
        console.log("All notification emails sent successfully");
      })
      .catch((emailError) => {
        console.error("Failed to send some notification emails:", emailError);
      });

    res.status(201).json(booking);
  } catch (error) {
    console.error("Create booking error:", error);
    res.status(500).json({
      message: "Failed to create booking",
      error: error.message,
    });
  }
};

// Get single booking by ID
const getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    res.status(200).json(booking);
  } catch (error) {
    console.error("Get booking by ID error:", error);
    res.status(500).json({
      message: "Failed to fetch booking",
      error: error.message,
    });
  }
};

// Update booking status - UPDATED with WebSocket notification
const updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (
      !["pending_confirmation", "confirmed", "cancelled", "pending"].includes(
        status
      )
    ) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const oldStatus = booking.status;
    booking.status = status;
    await booking.save();

    console.log(
      `Booking ${booking.bookingId} status updated from ${oldStatus} to ${status}`
    );

    // 🔔 EMIT WEBSOCKET NOTIFICATION FOR STATUS UPDATE
    try {
      bookingWebSocketServer.emitBookingStatusUpdate(
        booking._id, 
        oldStatus, 
        status, 
        booking
      );
      console.log("✅ WebSocket notification sent for status update:", booking.bookingId);
    } catch (wsError) {
      console.error("❌ Failed to send WebSocket notification:", wsError);
      // Don't fail the request if WebSocket fails
    }

    // Send status update email to customer (background)
    sendStatusUpdateEmail(booking, oldStatus, status).catch((emailError) => {
      console.error("Failed to send status update email:", emailError);
    });

    res.status(200).json({ status: booking.status });
  } catch (error) {
    console.error("Update booking status error:", error);
    res.status(500).json({
      message: "Failed to update status",
      error: error.message,
    });
  }
};

// Update booking payment
const updateBookingPayment = async (req, res) => {
  try {
    const { paymentStatus, amountPaid } = req.body;

    if (!["unpaid", "partial", "paid"].includes(paymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status" });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    booking.paymentStatus = paymentStatus;
    booking.amountPaid = amountPaid || 0;
    await booking.save();

    console.log(
      `Booking ${booking.bookingId} payment updated: ${paymentStatus}, amount: ${amountPaid}`
    );

    res.status(200).json({
      paymentStatus: booking.paymentStatus,
      amountPaid: booking.amountPaid,
    });
  } catch (error) {
    console.error("Update booking payment error:", error);
    res.status(500).json({
      message: "Failed to update payment",
      error: error.message,
    });
  }
};

// Update booking items/services
const updateBookingItems = async (req, res) => {
  try {
    const { items, services, amount } = req.body;

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Update services if provided (new format)
    if (services) {
      booking.services = services;

      // Recalculate pricing
      const itemsSubtotal = services.reduce(
        (sum, service) => sum + service.subtotal,
        0
      );
      const calculatedPricing = calculateFormattedPricing(itemsSubtotal);

      booking.pricing = {
        ...booking.pricing,
        ...calculatedPricing,
        totalItems: services.reduce(
          (sum, service) => sum + service.quantity,
          0
        ),
        totalServices: services.length,
      };
    }

    // Update legacy items format if provided
    if (items) {
      booking.items = items;
    }

    // Update amount if provided
    if (amount) {
      if (typeof amount === "number") {
        booking.pricing = booking.pricing || {};
        booking.pricing.totalAmount = amount;
        booking.pricing.formatted = booking.pricing.formatted || {};
        booking.pricing.formatted.total = formatCurrency(amount);
      } else {
        booking.amount = amount;
      }
    }

    await booking.save();

    console.log(`Booking ${booking.bookingId} items updated`);

    res.status(200).json({
      items: booking.items,
      services: booking.services,
      amount: booking.amount || booking.pricing?.formatted?.total,
      pricing: booking.pricing,
    });
  } catch (error) {
    console.error("Update booking items error:", error);
    res.status(500).json({
      message: "Failed to update items",
      error: error.message,
    });
  }
};

// Generate and send invoice
const generateInvoice = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const { invoiceData } = req.body;

    // Generate invoice number if not provided
    const invoiceNumber =
      invoiceData?.invoiceNumber || `INV-${booking.bookingId}`;

    // Update booking with invoice information
    booking.invoiceGenerated = true;
    booking.invoiceNumber = invoiceNumber;
    booking.lastInvoiceUpdate = new Date();

    await booking.save();

    // Send invoice email
    try {
      await sendInvoiceEmail(booking, invoiceData);
      booking.invoiceSentAt = new Date();
      await booking.save();
    } catch (emailError) {
      console.error("Failed to send invoice email:", emailError);
      return res.status(500).json({
        message: "Invoice generated but failed to send email",
        error: emailError.message,
      });
    }

    console.log(
      `Invoice ${invoiceNumber} generated and sent for booking ${booking.bookingId}`
    );

    res.status(200).json({
      message: "Invoice generated and sent successfully",
      invoiceNumber,
      sentTo: booking.customer.personalInfo.email,
    });
  } catch (error) {
    console.error("Generate invoice error:", error);
    res.status(500).json({
      message: "Failed to generate invoice",
      error: error.message,
    });
  }
};

// FIXED: Send invoice by email with PDF attachment and proper logo handling
const sendInvoiceByEmail = async (req, res) => {
  try {
    const { invoiceData, customerEmail, customerName } = req.body;

    if (!invoiceData || !customerEmail) {
      return res.status(400).json({
        message: "Missing required fields: invoiceData and customerEmail",
      });
    }

    console.log("Sending invoice email to:", customerEmail);
    console.log("Invoice data received:", invoiceData);

    // Generate PDF buffer from invoice data
    const pdfBuffer = await generateInvoicePDF(invoiceData);

    // Send email with PDF attachment and logo
    await sendInvoiceEmailWithPDF(
      customerEmail,
      customerName,
      invoiceData,
      pdfBuffer
    );

    // Optionally update booking record if bookingId is provided
    if (invoiceData.bookingId) {
      try {
        const booking = await Booking.findById(invoiceData.bookingId);
        if (booking) {
          booking.invoiceGenerated = true;
          booking.invoiceNumber = invoiceData.invoiceNumber;
          booking.invoiceSentAt = new Date();
          booking.lastInvoiceUpdate = new Date();
          await booking.save();
          console.log(
            `Updated booking ${invoiceData.bookingId} with invoice info`
          );
        }
      } catch (updateError) {
        console.warn("Failed to update booking record:", updateError);
      }
    }

    res.status(200).json({
      message: "Invoice sent successfully",
      sentTo: customerEmail,
      invoiceNumber: invoiceData.invoiceNumber,
    });
  } catch (error) {
    console.error("Failed to send invoice email:", error);
    res.status(500).json({
      message: "Failed to send invoice",
      error: error.message,
    });
  }
};

// Delete booking - UPDATED with WebSocket notification
const deleteBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Store booking info for potential notification
    const bookingInfo = {
      bookingId: booking.bookingId,
      customerName: booking.customer?.personalInfo?.name,
      customerEmail: booking.customer?.personalInfo?.email,
      eventType: booking.customer?.eventDetails?.eventType,
      eventDate: booking.eventSchedule?.startDate,
    };

    await Booking.findByIdAndDelete(req.params.id);

    console.log(`Booking ${bookingInfo.bookingId} deleted successfully`);

    // 🔔 EMIT WEBSOCKET NOTIFICATION FOR BOOKING DELETION
    try {
      bookingWebSocketServer.emitBookingDeletion(booking._id, bookingInfo);
      console.log("✅ WebSocket notification sent for booking deletion:", bookingInfo.bookingId);
    } catch (wsError) {
      console.error("❌ Failed to send WebSocket notification:", wsError);
      // Don't fail the request if WebSocket fails
    }

    // Optionally send cancellation email to customer
    if (bookingInfo.customerEmail) {
      sendBookingDeletionEmail(bookingInfo).catch((emailError) => {
        console.error(
          "Failed to send deletion notification email:",
          emailError
        );
      });
    }

    res.status(200).json({
      message: "Booking deleted successfully",
      deletedBookingId: bookingInfo.bookingId,
    });
  } catch (error) {
    console.error("Delete booking error:", error);
    res.status(500).json({
      message: "Failed to delete booking",
      error: error.message,
    });
  }
};

// FIXED: Generate PDF from invoice data with proper logo handling
const generateInvoicePDF = async (invoiceData) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40 }); // Reduced margin for single page
      const buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on("error", reject);

      await generatePDFContent(doc, invoiceData); // Now await the async function
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

// FIXED: Generate PDF content optimized for single page layout - now async for logo fetching
const generatePDFContent = async (doc, invoiceData) => {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 40; // Reduced margin

  // Colors
  const primaryColor = "#4F46E5";
  const grayColor = "#6B7280";
  const darkColor = "#1F2937";

  // Header
  doc
    .fontSize(24) // Reduced from 32
    .fillColor(primaryColor)
    .text("INVOICE", margin, margin, { align: "left" });

  // Invoice details (top right) - moved further left to avoid logo overlap
  const headerY = margin;
  doc
    .fontSize(9) // Reduced from 10
    .fillColor(darkColor)
    .text(`Invoice #: ${invoiceData.invoiceNumber}`, pageWidth - 220, headerY)
    .text(
      `Issue Date: ${new Date(invoiceData.issueDate).toLocaleDateString()}`,
      pageWidth - 220,
      headerY + 12
    )
    .text(
      `Due Date: ${new Date(invoiceData.dueDate).toLocaleDateString()}`,
      pageWidth - 220,
      headerY + 24
    );

  // FIXED: Company logo with URL support - fetch image for PDF use
  const logoOptions = {
    cloudinaryUrl: process.env.CLOUDINARY_LOGO_URL || "https://res.cloudinary.com/dc7jgb30v/image/upload/v1754220509/ibloomcut_mlsrwt.png",
    localPaths: [
      path.join(__dirname, "../../assets/ibloomcut.png"),
      path.join(__dirname, "../assets/ibloomcut.png"),
      path.join(__dirname, "../../public/assets/ibloomcut.png"),
      path.join(__dirname, "../public/assets/ibloomcut.png"),
      path.join(process.cwd(), "assets/ibloomcut.png"),
      path.join(process.cwd(), "public/assets/ibloomcut.png")
    ]
  };

  let logoAdded = false;

  // Try Cloudinary URL first - fetch the image as buffer for PDF
  if (logoOptions.cloudinaryUrl && logoOptions.cloudinaryUrl.startsWith("http")) {
    try {
      console.log("Fetching logo from Cloudinary for PDF:", logoOptions.cloudinaryUrl);
      const https = require('https');
      const http = require('http');
      
      await new Promise((resolve, reject) => {
        const client = logoOptions.cloudinaryUrl.startsWith('https:') ? https : http;
        
        client.get(logoOptions.cloudinaryUrl, (response) => {
          if (response.statusCode === 200) {
            const data = [];
            response.on('data', chunk => data.push(chunk));
            response.on('end', () => {
              try {
                const logoBuffer = Buffer.concat(data);
                doc.image(logoBuffer, pageWidth - 110, headerY + 40, {
                  width: 60,
                  height: 60,
                  fit: [60, 60],
                  align: "center",
                });
                logoAdded = true;
                console.log("Logo added to PDF from Cloudinary buffer, size:", logoBuffer.length, "bytes");
                resolve();
              } catch (error) {
                console.error("Error adding logo buffer to PDF:", error);
                resolve(); // Continue to fallback
              }
            });
          } else {
            console.log("Failed to fetch logo from Cloudinary, status:", response.statusCode);
            resolve(); // Continue to fallback
          }
        }).on('error', (error) => {
          console.error("Error fetching logo from Cloudinary:", error);
          resolve(); // Continue to fallback
        });
      });
    } catch (error) {
      console.error("Error with Cloudinary URL:", error);
    }
  }

  // Fallback to local paths if Cloudinary failed
  if (!logoAdded) {
    for (const logoPath of logoOptions.localPaths) {
      try {
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, pageWidth - 110, headerY + 40, {
            width: 60,
            height: 60,
            fit: [60, 60],
            align: "center",
          });
          logoAdded = true;
          console.log("Logo added to PDF from local path:", logoPath);
          break;
        }
      } catch (error) {
        console.error("Error adding logo from path:", logoPath, error);
        continue;
      }
    }
  }

  // Fallback to placeholder if no logo found
  if (!logoAdded) {
    doc
      .rect(pageWidth - 110, headerY + 40, 60, 60)
      .fillColor("#E5E7EB")
      .fill();
    doc
      .fontSize(10)
      .fillColor("#9CA3AF")
      .text("LOGO", pageWidth - 95, headerY + 65);
    console.log("Logo placeholder added to PDF");
  }

  let currentY = headerY + 110; // Reduced from 150

  // From and To sections - more compact
  doc
    .fontSize(10) // Reduced from 12
    .fillColor(darkColor)
    .font("Helvetica-Bold")
    .text("From:", margin, currentY);

  doc
    .font("Helvetica")
    .fontSize(11) // Reduced from 14
    .text(invoiceData.company.name, margin, currentY + 15)
    .fontSize(8) // Reduced from 10
    .text(invoiceData.company.address, margin, currentY + 30)
    .text(
      `${invoiceData.company.city}, ${invoiceData.company.state}`,
      margin,
      currentY + 42
    )
    .text(invoiceData.company.country, margin, currentY + 54)
    .text(invoiceData.company.phone, margin, currentY + 66)
    .text(invoiceData.company.email, margin, currentY + 78);

  // Bill To section
  const billToX = pageWidth / 2 + 30;
  doc
    .fontSize(10)
    .fillColor(darkColor)
    .font("Helvetica-Bold")
    .text("Bill To:", billToX, currentY);

  doc
    .font("Helvetica")
    .fontSize(11)
    .text(invoiceData.customer.name, billToX, currentY + 15)
    .fontSize(8)
    .text(invoiceData.customer.email, billToX, currentY + 30)
    .text(invoiceData.customer.phone, billToX, currentY + 42)
    .text(invoiceData.customer.address, billToX, currentY + 54);

  currentY += 100; // Reduced from 150

  // Event Details Box - more compact
  doc
    .rect(margin, currentY, pageWidth - 2 * margin, 55) // Reduced height
    .fillColor("#F3F4F6")
    .fill();

  doc
    .fontSize(10) // Reduced from 12
    .fillColor(primaryColor)
    .font("Helvetica-Bold")
    .text("Event Details", margin + 10, currentY + 10);

  const eventY = currentY + 25;
  const eventCol1 = margin + 10;
  const eventCol2 = pageWidth / 2 + 20;

  doc
    .fontSize(8) // Reduced from 9
    .fillColor(darkColor)
    .font("Helvetica")
    .text(`Type: ${invoiceData.event.type}`, eventCol1, eventY)
    .text(
      `Date: ${new Date(invoiceData.event.date).toLocaleDateString()}`,
      eventCol2,
      eventY
    )
    .text(`Time: ${invoiceData.event.time}`, eventCol1, eventY + 12)
    .text(`Guests: ${invoiceData.event.guests}`, eventCol2, eventY + 12)
    .text(`Location: ${invoiceData.event.location}`, eventCol1, eventY + 24, {
      width: pageWidth - 2 * margin - 20,
    });

  currentY += 70; // Reduced from 100

  // Services Table - more compact
  if (invoiceData.services && invoiceData.services.length > 0) {
    doc
      .fontSize(10)
      .fillColor(primaryColor)
      .font("Helvetica-Bold")
      .text("Booked Services", margin, currentY);

    currentY += 18; // Reduced from 25

    invoiceData.services.forEach((service, index) => {
      doc
        .fontSize(9) // Reduced from 10
        .fillColor(darkColor)
        .font("Helvetica-Bold")
        .text(`${service.name} (Qty: ${service.quantity})`, margin, currentY)
        .font("Helvetica")
        .text(
          `₦${service.total.toLocaleString("en-NG", {
            minimumFractionDigits: 2,
          })}`,
          pageWidth - 120,
          currentY,
          { align: "right" }
        );

      if (service.description) {
        currentY += 12; // Reduced from 15
        doc
          .fontSize(7) // Reduced from 8
          .fillColor(grayColor)
          .text(service.description, margin, currentY, {
            width: pageWidth - 2 * margin - 120,
          });
      }

      currentY += 18; // Reduced from 25
    });
  }

  // FIXED: Additional Services Section - more compact
  if (
    invoiceData.additionalServices &&
    invoiceData.additionalServices.length > 0
  ) {
    currentY += 15; // Reduced from 20
    doc
      .fontSize(10)
      .fillColor(primaryColor)
      .font("Helvetica-Bold")
      .text("Additional Services", margin, currentY);

    currentY += 15; // Reduced from 20

    invoiceData.additionalServices.forEach((service, index) => {
      const statusText = service.included ? "✓ Included" : "✗ Not Included";
      const statusColor = service.included ? "#059669" : "#DC2626";

      doc
        .fontSize(9) // Reduced from 10
        .fillColor(darkColor)
        .font("Helvetica-Bold")
        .text(service.name, margin, currentY)
        .fontSize(8) // Reduced from 9
        .fillColor(statusColor)
        .font("Helvetica-Bold")
        .text(statusText, pageWidth - 120, currentY, { align: "right" });

      if (service.required) {
        doc
          .fontSize(7) // Reduced from 8
          .fillColor("#EA580C")
          .text("(Required)", margin + 120, currentY);
      }

      currentY += 15; // Reduced from 20
    });

    // FIXED: Add delivery and setup pricing note - more compact
    currentY += 8; // Reduced from 10
    doc
      .rect(margin, currentY, pageWidth - 2 * margin, 30) // Reduced height
      .fillColor("#FEF3C7")
      .fill();

    doc
      .fontSize(8) // Reduced from 10
      .fillColor("#92400E")
      .font("Helvetica-Bold")
      .text("📦 Important Note:", margin + 10, currentY + 8)
      .font("Helvetica")
      .fontSize(7) // Reduced font
      .text(
        "Delivery and setup prices will be added and negotiated separately.",
        margin + 10,
        currentY + 18,
        { width: pageWidth - 2 * margin - 20 }
      );

    currentY += 40; // Reduced from 60
  }

  // Totals section - positioned on right side, more compact
  const totalsX = pageWidth - 250; // Adjusted position
  const totalsY = currentY + 10;

  // Draw totals background
  doc
    .rect(totalsX - 15, totalsY - 8, 230, 85) // More compact
    .fillColor("#F9FAFB")
    .fill();

  doc
    .fontSize(9) // Reduced from 10
    .fillColor(darkColor)
    .font("Helvetica")
    .text("Subtotal:", totalsX, totalsY)
    .text(
      `₦${(invoiceData.subtotal || 0).toLocaleString("en-NG", {
        minimumFractionDigits: 2,
      })}`,
      totalsX + 130,
      totalsY,
      { align: "right" }
    )
    .text(
      `Tax (${((invoiceData.taxRate || 0.075) * 100).toFixed(1)}%):`,
      totalsX,
      totalsY + 15
    )
    .text(
      `₦${(invoiceData.tax || 0).toLocaleString("en-NG", {
        minimumFractionDigits: 2,
      })}`,
      totalsX + 130,
      totalsY + 15,
      { align: "right" }
    );

  // Total line
  doc
    .moveTo(totalsX, totalsY + 28)
    .lineTo(totalsX + 200, totalsY + 28)
    .strokeColor(darkColor)
    .lineWidth(1)
    .stroke();

  doc
    .fontSize(12) // Reduced from 14
    .font("Helvetica-Bold")
    .fillColor(darkColor)
    .text("Total:", totalsX, totalsY + 35)
    .text(
      `₦${(invoiceData.total || 0).toLocaleString("en-NG", {
        minimumFractionDigits: 2,
      })}`,
      totalsX + 130,
      totalsY + 35,
      { align: "right" }
    );

  // Deposit info if required
  if (invoiceData.requiresDeposit) {
    doc
      .fontSize(9) // Reduced from 11
      .fillColor("#EA580C")
      .font("Helvetica-Bold")
      .text("Deposit Required (50%):", totalsX, totalsY + 55)
      .text(
        `₦${(invoiceData.depositAmount || 0).toLocaleString("en-NG", {
          minimumFractionDigits: 2,
        })}`,
        totalsX + 130,
        totalsY + 55,
        { align: "right" }
      );
  }

  // Bank Details Section - positioned on left side, more compact
  if (
    invoiceData.company.bankDetails &&
    invoiceData.company.bankDetails.bankName
  ) {
    const bankY = totalsY;
    
    doc
      .rect(margin, bankY, pageWidth / 2 - 20, 85) // More compact
      .fillColor("#F0FDF4")
      .fill();

    doc
      .fontSize(10) // Reduced from 12
      .fillColor("#059669")
      .font("Helvetica-Bold")
      .text("Payment Information", margin + 10, bankY + 8);

    doc
      .fontSize(8) // Reduced from 9
      .fillColor(darkColor)
      .font("Helvetica")
      .text(
        `Bank: ${invoiceData.company.bankDetails.bankName}`,
        margin + 10,
        bankY + 22
      )
      .text(
        `Account: ${invoiceData.company.bankDetails.accountName}`,
        margin + 10,
        bankY + 34
      )
      .text(
        `Number: ${invoiceData.company.bankDetails.accountNumber}`,
        margin + 10,
        bankY + 46
      )
      .text(
        `Reference: ${invoiceData.invoiceNumber}`,
        margin + 10,
        bankY + 58
      );

    if (invoiceData.company.bankDetails.sortCode) {
      doc.text(
        `Sort Code: ${invoiceData.company.bankDetails.sortCode}`,
        margin + 10,
        bankY + 70
      );
    }
  }

  currentY = totalsY + 100;

  // Footer - more compact
  doc
    .fontSize(10) // Reduced from 12
    .fillColor(darkColor)
    .font("Helvetica-Bold")
    .text("Thank you for your business!", margin, currentY, {
      align: "center",
      width: pageWidth - 2 * margin,
    });

  doc
    .fontSize(7) // Reduced from 8
    .fillColor(grayColor)
    .font("Helvetica")
    .text(
      `Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`,
      margin,
      currentY + 15,
      { align: "center", width: pageWidth - 2 * margin }
    );
};

// FIXED: Enhanced email sending function for invoices with PDF and proper logo
const sendInvoiceEmailWithPDF = async (
  customerEmail,
  customerName,
  invoiceData,
  pdfBuffer
) => {
  const logoBase64 = await getLogoBase64(); // Now async

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: customerEmail,
    subject: `💰 Invoice ${invoiceData.invoiceNumber} - Your Event Booking`,
    html: generateInvoiceEmailHTML(customerName, invoiceData, logoBase64),
    attachments: [
      {
        filename: `Invoice-${invoiceData.invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  };

  // Add logo as embedded attachment if available
  if (logoBase64) {
    mailOptions.attachments.push({
      filename: "logo.png",
      content: logoBase64.split("base64,")[1],
      encoding: "base64",
      cid: "companylogo", // Referenced in HTML
    });
  }

  await transporter.sendMail(mailOptions);
  console.log(`Invoice email with PDF sent to: ${customerEmail}`);
};

// FIXED: Generate HTML content for invoice email with proper logo and delivery/setup notes
const generateInvoiceEmailHTML = (customerName, invoiceData, logoBase64) => {
  const logoImg = logoBase64
    ? `<img src="cid:companylogo" alt="Company Logo" style="width: 80px; height: 80px; object-fit: contain; border-radius: 8px;">`
    : `<div style="width: 80px; height: 80px; background: #E5E7EB; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #9CA3AF; font-weight: bold; font-size: 12px;">LOGO</div>`;

  // Generate additional services HTML
  const additionalServicesHTML = invoiceData.additionalServices
    ? invoiceData.additionalServices
        .map((service) => {
          const statusIcon = service.included ? "✅" : "❌";
          const statusText = service.included ? "Included" : "Not Included";
          const statusColor = service.included ? "#059669" : "#DC2626";

          return `
            <tr style="border-bottom: 1px solid #E5E7EB;">
              <td style="padding: 8px 0; font-weight: bold;">${service.name}${
            service.required
              ? ' <span style="color: #EA580C;">(Required)</span>'
              : ""
          }</td>
              <td style="padding: 8px 0; text-align: right; color: ${statusColor}; font-weight: bold;">${statusIcon} ${statusText}</td>
            </tr>
          `;
        })
        .join("")
    : "";

  // FIXED: Add delivery/setup note in email
  const deliverySetupNote = additionalServicesHTML
    ? `
      <div style="background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 15px; margin-top: 15px;">
        <p style="margin: 0; color: #92400E; font-weight: bold;">📦 Important Note:</p>
        <p style="margin: 5px 0 0 0; color: #92400E; font-size: 14px;">Delivery and setup prices will be added and negotiated separately, if selected by you based on location and requirements.</p>
      </div>
    `
    : "";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%); color: white; padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 30px; position: relative;">
        <div style="position: absolute; top: 15px; right: 15px;">
          ${logoImg}
        </div>
        <h1 style="margin: 0; font-size: 28px;">💰 Invoice Ready</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Your event booking invoice is attached</p>
      </div>

      <!-- Greeting -->
      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
        <h2 style="color: #1F2937; margin-top: 0;">Hello ${customerName}! 👋</h2>
        <p style="margin: 0;">Thank you for choosing our services! Please find your invoice attached for your upcoming event booking.</p>
      </div>

      <!-- Invoice Summary -->
      <div style="background: white; border: 2px solid #E5E7EB; border-radius: 10px; padding: 25px; margin-bottom: 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h3 style="color: #4F46E5; margin-top: 0; display: flex; align-items: center;">
          📄 Invoice Summary
        </h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Invoice Number:</td>
            <td style="padding: 12px 0; font-weight: bold;">${
              invoiceData.invoiceNumber
            }</td>
          </tr>
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Issue Date:</td>
            <td style="padding: 12px 0;">${new Date(
              invoiceData.issueDate
            ).toLocaleDateString()}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Due Date:</td>
            <td style="padding: 12px 0; color: #DC2626; font-weight: bold;">${new Date(
              invoiceData.dueDate
            ).toLocaleDateString()}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Event Type:</td>
            <td style="padding: 12px 0;">${invoiceData.event.type}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Event Date:</td>
            <td style="padding: 12px 0;">${new Date(
              invoiceData.event.date
            ).toLocaleDateString()}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Subtotal:</td>
            <td style="padding: 12px 0; font-weight: bold;">₦${(
              invoiceData.subtotal || 0
            ).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Tax (${(
              (invoiceData.taxRate || 0.075) * 100
            ).toFixed(1)}%):</td>
            <td style="padding: 12px 0; font-weight: bold;">₦${(
              invoiceData.tax || 0
            ).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr style="background: #F0FDF4;">
            <td style="padding: 15px 0; font-weight: bold; color: #166534; font-size: 16px;">Total Amount:</td>
            <td style="padding: 15px 0; font-weight: bold; color: #059669; font-size: 20px;">₦${(
              invoiceData.total || 0
            ).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</td>
          </tr>
          ${
            invoiceData.requiresDeposit
              ? `
          <tr style="background: #FEF3C7;">
            <td style="padding: 12px 0; font-weight: bold; color: #92400E;">Deposit Required:</td>
            <td style="padding: 12px 0; font-weight: bold; color: #D97706;">₦${(
              invoiceData.depositAmount || 0
            ).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</td>
          </tr>
          `
              : ""
          }
        </table>
      </div>

      <!-- Additional Services -->
      ${
        additionalServicesHTML
          ? `
      <div style="background: white; border: 2px solid #E5E7EB; border-radius: 10px; padding: 25px; margin-bottom: 25px;">
        <h3 style="color: #4F46E5; margin-top: 0;">🛠️ Additional Services</h3>
        <table style="width: 100%; border-collapse: collapse;">
          ${additionalServicesHTML}
        </table>
        ${deliverySetupNote}
      </div>
      `
          : ""
      }

      <!-- Payment Instructions -->
      <div style="background: #EFF6FF; border: 2px solid #DBEAFE; border-radius: 10px; padding: 25px; margin-bottom: 25px;">
        <h3 style="color: #1E40AF; margin-top: 0; display: flex; align-items: center;">
          💳 Payment Instructions
        </h3>
        <div style="color: #1E3A8A;">
          <p style="margin-bottom: 15px;"><strong>Payment Methods Accepted:</strong></p>
          <ul style="margin: 0; padding-left: 20px;">
            <li style="margin-bottom: 8px;">Bank Transfer (Preferred)</li>
            <li style="margin-bottom: 8px;">Cash payment (upon delivery)</li>
            <li style="margin-bottom: 8px;">Mobile money transfers</li>
          </ul>
          ${
            invoiceData.company.bankDetails &&
            invoiceData.company.bankDetails.bankName
              ? `
          <div style="background: white; padding: 15px; border-radius: 6px; margin-top: 15px; border-left: 4px solid #3B82F6;">
            <p style="margin: 0; font-weight: bold; color: #1E40AF;">Bank Details:</p>
            <p style="margin: 5px 0 0 0; font-size: 14px;">
              Bank: ${invoiceData.company.bankDetails.bankName}<br>
              Account Name: ${invoiceData.company.bankDetails.accountName}<br>
              Account Number: ${
                invoiceData.company.bankDetails.accountNumber
              }<br>
              ${
                invoiceData.company.bankDetails.sortCode
                  ? `Sort Code: ${invoiceData.company.bankDetails.sortCode}<br>`
                  : ""
              }
              Reference: ${invoiceData.invoiceNumber}
            </p>
          </div>
          `
              : ""
          }
        </div>
      </div>

      <!-- Important Notes -->
      <div style="background: #FEF2F2; border: 2px solid #FECACA; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
        <h3 style="color: #DC2626; margin-top: 0;">⚠️ Important Notes</h3>
        <ul style="color: #7F1D1D; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">Payment is due by <strong>${new Date(
            invoiceData.dueDate
          ).toLocaleDateString()}</strong></li>
          <li style="margin-bottom: 8px;">Late payments may incur additional fees</li>
          ${
            invoiceData.requiresDeposit
              ? '<li style="margin-bottom: 8px;">A deposit is required to secure your booking</li>'
              : ""
          }
          <li style="margin-bottom: 8px;">Please quote the invoice number when making payment</li>
          <li style="margin-bottom: 8px;">Contact us immediately if you have any questions</li>
          <li style="margin-bottom: 8px;"><strong>Delivery and setup prices will be added and negotiated separately if selected.</strong></li>
        </ul>
      </div>

      <!-- Next Steps -->
      <div style="background: #F0FDF4; border: 2px solid #BBF7D0; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
        <h3 style="color: #15803D; margin-top: 0;">📋 What's Next?</h3>
        <ol style="color: #166534; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 10px;">Review the attached invoice carefully</li>
          <li style="margin-bottom: 10px;">Make payment by the due date specified</li>
          <li style="margin-bottom: 10px;">Send us payment confirmation</li>
          <li style="margin-bottom: 10px;">We'll confirm and schedule your event setup</li>
          <li style="margin-bottom: 10px;">Enjoy your amazing event! 🎉</li>
        </ol>
      </div>

      <!-- Contact Information -->
      <div style="background: #F8FAFC; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 20px;">
        <h3 style="color: #374151; margin-top: 0;">📞 Need Help?</h3>
        <p style="margin: 10px 0; color: #6B7280;">Our team is here to assist you with any questions about your invoice or booking.</p>
        <div style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin-top: 15px;">
          <a href="mailto:${
            invoiceData.company.email
          }" style="color: #4F46E5; text-decoration: none; font-weight: bold;">
            📧 ${invoiceData.company.email}
          </a>
          <a href="tel:${
            invoiceData.company.phone
          }" style="color: #4F46E5; text-decoration: none; font-weight: bold;">
            📱 ${invoiceData.company.phone}
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="text-align: center; padding: 20px; background: #F8FAFC; border-radius: 8px; border-top: 3px solid #4F46E5;">
        <p style="margin: 0; color: #6B7280; font-size: 16px; font-weight: bold;">
          Thank you for choosing ${invoiceData.company.name}!
        </p>
        <p style="margin: 10px 0 0 0; color: #9CA3AF; font-size: 12px;">
          This email was sent automatically. Please save this email and the attached invoice for your records.
        </p>
        <p style="margin: 5px 0 0 0; color: #9CA3AF; font-size: 12px;">
          Invoice generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
        </p>
      </div>
    </body>
    </html>
  `;
};

// Helper function to format date time range for emails
const formatDateTimeRange = (eventSchedule) => {
  if (!eventSchedule) return "N/A";

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeString) => {
    if (!timeString) return "";
    const [hours, minutes] = timeString.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const startDate = formatDate(eventSchedule.startDate);
  const endDate = formatDate(eventSchedule.endDate);
  const startTime = formatTime(eventSchedule.startTime);
  const endTime = formatTime(eventSchedule.endTime);

  if (!eventSchedule.isMultiDay) {
    return `${startDate} • ${startTime} - ${endTime}`;
  } else {
    return `${startDate} ${startTime} - ${endDate} ${endTime}`;
  }
};

// FIXED: Send booking confirmation email with proper logo
const sendBookingConfirmationEmail = async (booking) => {
  const customerEmail = booking.customer.personalInfo.email;
  const customerName = booking.customer.personalInfo.name;
  const logoBase64 = await getLogoBase64(); // Now async

  const services = booking.services || [];
  const servicesHTML = services
    .map(
      (service) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">${
        service.name
      }</td>
      <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; text-align: center;">${
        service.quantity
      }</td>
      <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(
        service.subtotal
      )}</td>
    </tr>
  `
    )
    .join("");

  const logoImg = logoBase64
    ? `<img src="cid:companylogo" alt="Company Logo" style="width: 60px; height: 60px; object-fit: contain; border-radius: 8px;">`
    : '<div style="width: 60px; height: 60px; background: #E5E7EB; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #9CA3AF; font-weight: bold; font-size: 10px;">LOGO</div>';

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: customerEmail,
    subject: `Booking Confirmation - ${booking.bookingId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Booking Confirmation</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px; position: relative;">
          <div style="position: absolute; top: 15px; right: 15px;">${logoImg}</div>
          <h1 style="margin: 0; font-size: 28px;">🎉 Booking Received!</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Thank you for choosing our services</p>
        </div>

        <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #1F2937; margin-top: 0;">Hello ${customerName}! 👋</h2>
          <p>We've received your event booking request and our team is excited to help make your event spectacular!</p>
          <p><strong>Your booking is currently pending confirmation.</strong> Our team will review the details and get back to you within 24 hours.</p>
        </div>

        <div style="background: white; border: 2px solid #E5E7EB; border-radius: 8px; padding: 25px; margin-bottom: 25px;">
          <h3 style="color: #4F46E5; margin-top: 0;">📋 Booking Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Booking ID:</td>
              <td style="padding: 8px 0;">${booking.bookingId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Event Type:</td>
              <td style="padding: 8px 0;">${
                booking.customer.eventDetails.eventType
              }</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Date & Time:</td>
              <td style="padding: 8px 0;">${formatDateTimeRange(
                booking.eventSchedule
              )}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Location:</td>
              <td style="padding: 8px 0;">${
                booking.customer.eventDetails.location
              }</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Guests:</td>
              <td style="padding: 8px 0;">${
                booking.customer.eventDetails.numberOfGuests
              } people</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Total Amount:</td>
              <td style="padding: 8px 0; font-weight: bold; color: #10B981; font-size: 18px;">${
                booking.pricing?.formatted?.total
              }</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Status:</td>
              <td style="padding: 8px 0;"><span style="background: #FEF3C7; color: #92400E; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">PENDING CONFIRMATION</span></td>
            </tr>
          </table>
        </div>

        ${
          services.length > 0
            ? `
        <div style="background: white; border: 2px solid #E5E7EB; border-radius: 8px; padding: 25px; margin-bottom: 25px;">
          <h3 style="color: #4F46E5; margin-top: 0;">🛍️ Selected Services</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #F9FAFB;">
                <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #E5E7EB;">Service</th>
                <th style="padding: 12px 8px; text-align: center; border-bottom: 2px solid #E5E7EB;">Qty</th>
                <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #E5E7EB;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${servicesHTML}
            </tbody>
          </table>
        </div>
        `
            : ""
        }

        <div style="text-align: center; padding: 20px; background: #F8FAFC; border-radius: 8px;">
          <p style="margin: 0; color: #6B7280; font-size: 14px;">
            Questions? Contact us at <a href="mailto:${
              process.env.EMAIL_USER
            }" style="color: #4F46E5;">${process.env.EMAIL_USER}</a>
          </p>
        </div>
      </body>
      </html>
    `,
    attachments: [],
  };

  // Add logo as embedded attachment if available
  if (logoBase64) {
    mailOptions.attachments.push({
      filename: "logo.png",
      content: logoBase64.split("base64,")[1],
      encoding: "base64",
      cid: "companylogo",
    });
  }

  await transporter.sendMail(mailOptions);
  console.log(`Confirmation email sent to customer: ${customerEmail}`);
};

// Send admin notification email
const sendAdminNotificationEmail = async (booking) => {
  const logoBase64 = await getLogoBase64(); // Now async

  const adminEmailPromises = ADMIN_EMAILS.map((adminEmail) => {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: adminEmail,
      subject: `🚨 NEW BOOKING ALERT - ${booking.bookingId}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #DC2626; color: white; padding: 20px; text-align: center;">
            <h1>🚨 NEW BOOKING RECEIVED</h1>
            <p>Booking ID: ${booking.bookingId}</p>
          </div>
          <div style="padding: 20px;">
            <h2>Customer: ${booking.customer.personalInfo.name}</h2>
            <p>Email: ${booking.customer.personalInfo.email}</p>
            <p>Phone: ${booking.customer.personalInfo.phone}</p>
            <p>Event: ${booking.customer.eventDetails.eventType}</p>
            <p>Date: ${formatDateTimeRange(booking.eventSchedule)}</p>
            <p>Total: ${booking.pricing?.formatted?.total}</p>
            <p><strong>Action Required: Please review and confirm this booking.</strong></p>
          </div>
        </body>
        </html>
      `,
    };

    return transporter.sendMail(mailOptions);
  });

  await Promise.all(adminEmailPromises);
  console.log(`Admin notification emails sent to: ${ADMIN_EMAILS.join(", ")}`);
};

// Send status update email
const sendStatusUpdateEmail = async (booking, oldStatus, newStatus) => {
  const customerEmail = booking.customer.personalInfo.email;
  const customerName = booking.customer.personalInfo.name;

  let subject, message, color;

  switch (newStatus) {
    case "confirmed":
      subject = `✅ Booking Confirmed - ${booking.bookingId}`;
      message = "Great news! Your booking has been confirmed.";
      color = "#10B981";
      break;
    case "cancelled":
      subject = `❌ Booking Cancelled - ${booking.bookingId}`;
      message = "We regret to inform you that your booking has been cancelled.";
      color = "#EF4444";
      break;
    default:
      subject = `📋 Booking Update - ${booking.bookingId}`;
      message = `Your booking status has been updated to: ${newStatus}`;
      color = "#F59E0B";
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: customerEmail,
    subject: subject,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${color}; color: white; padding: 20px; text-align: center;">
          <h1>📋 Booking Status Update</h1>
          <p>${message}</p>
        </div>
        <div style="padding: 20px;">
          <h2>Hello ${customerName}!</h2>
          <p>Booking ID: ${booking.bookingId}</p>
          <p>New Status: <strong>${newStatus.toUpperCase()}</strong></p>
          <p>If you have any questions, please contact us.</p>
        </div>
      </body>
      </html>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`Status update email sent to: ${customerEmail}`);
};

// Send booking deletion email
const sendBookingDeletionEmail = async (bookingInfo) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: bookingInfo.customerEmail,
    subject: `❌ Booking Cancelled - ${bookingInfo.bookingId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #DC2626; color: white; padding: 20px; text-align: center;">
          <h1>❌ Booking Cancelled</h1>
        </div>
        <div style="padding: 20px;">
          <h2>Hello ${bookingInfo.customerName}!</h2>
          <p>We regret to inform you that your booking has been cancelled.</p>
          <p>Booking ID: ${bookingInfo.bookingId}</p>
          <p>Event Type: ${bookingInfo.eventType || "N/A"}</p>
          <p>If you have any questions, please contact us.</p>
        </div>
      </body>
      </html>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(
    `Deletion notification email sent to: ${bookingInfo.customerEmail}`
  );
};

// Legacy invoice email function (keeping for backward compatibility)
const sendInvoiceEmail = async (booking, invoiceData) => {
  const customerEmail = booking.customer.personalInfo.email;
  const customerName = booking.customer.personalInfo.name;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: customerEmail,
    subject: `💰 Invoice ${invoiceData.invoiceNumber} - ${booking.bookingId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #4F46E5; color: white; padding: 20px; text-align: center;">
          <h1>💰 Invoice Generated</h1>
        </div>
        <div style="padding: 20px;">
          <h2>Hello ${customerName}!</h2>
          <p>Your invoice has been generated for booking ${booking.bookingId}</p>
          <p>Invoice Number: ${invoiceData.invoiceNumber}</p>
          <p>Please make payment according to the terms specified.</p>
        </div>
      </body>
      </html>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`Invoice email sent to: ${customerEmail}`);
};

module.exports = {
  getBookings,
  createBooking,
  getBookingById,
  updateBookingStatus,
  updateBookingPayment,
  updateBookingItems,
  generateInvoice,
  sendInvoiceByEmail,
  deleteBooking,
};
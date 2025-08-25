// controllers/orderController.js - COMPLETE ORDERS CONTROLLER WITH WEBSOCKET AND INVOICE SUPPORT
const Order = require('../models/Order');
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// Import Generic WebSocket server - will be available globally
 const genericWebSocketServer = require("../webSocket/genericWebSocket");

// Email configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// FIXED: Helper function to get logo - supports both URL and local paths
const getLogoBase64 = async () => {
  // Option 1: Try Cloudinary URL first (RECOMMENDED)
  const CLOUDINARY_LOGO_URL =
    process.env.CLOUDINARY_LOGO_URL ||
    "https://res.cloudinary.com/your-cloud-name/image/upload/v1234567890/ibloomcut.png";

  try {
    if (CLOUDINARY_LOGO_URL && CLOUDINARY_LOGO_URL.startsWith("http")) {
      console.log(
        "Trying to load logo from Cloudinary URL:",
        CLOUDINARY_LOGO_URL
      );
      const https = require("https");
      const http = require("http");

      return new Promise((resolve, reject) => {
        const client = CLOUDINARY_LOGO_URL.startsWith("https:") ? https : http;

        client
          .get(CLOUDINARY_LOGO_URL, (response) => {
            if (response.statusCode === 200) {
              const data = [];
              response.on("data", (chunk) => data.push(chunk));
              response.on("end", () => {
                const buffer = Buffer.concat(data);
                console.log(
                  "Logo loaded successfully from Cloudinary, size:",
                  buffer.length,
                  "bytes"
                );
                resolve(`data:image/png;base64,${buffer.toString("base64")}`);
              });
            } else {
              console.log(
                "Failed to load from Cloudinary, status:",
                response.statusCode
              );
              resolve(tryLocalLogoPaths()); // Fallback to local
            }
          })
          .on("error", (error) => {
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
    path.join(process.cwd(), "public/assets/ibloomcut.png"),
  ];

  for (const logoPath of possiblePaths) {
    try {
      console.log("Trying local logo path:", logoPath);
      console.log("Logo file exists:", fs.existsSync(logoPath));

      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        console.log(
          "Logo loaded successfully from local path, size:",
          logoBuffer.length,
          "bytes"
        );
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

// Helper function to calculate order total with daily rates
const calculateOrderPricing = (order, dailyRate = 0) => {
  const { items, dateInfo } = order;
  const { startDate, endDate } = dateInfo;
  
  // Calculate rental duration
  const start = new Date(startDate);
  const end = new Date(endDate);
  const durationInDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  
  // Calculate items subtotal (quantity-based)
  const itemsSubtotal = items.reduce((total, item) => {
    return total + (item.pricePerDay * item.quantity);
  }, 0);
  
  // Calculate daily rate charges
  const dailyCharges = dailyRate * durationInDays;
  
  // Calculate subtotal
  const subtotal = itemsSubtotal + dailyCharges;
  
  // Calculate tax (7.5%)
  const tax = subtotal * 0.075;
  
  // Calculate total
  const total = subtotal + tax;
  
  return {
    itemsSubtotal,
    dailyCharges,
    dailyRate,
    durationInDays,
    subtotal,
    tax,
    total,
    formatted: {
      itemsSubtotal: formatCurrency(itemsSubtotal),
      dailyCharges: formatCurrency(dailyCharges),
      dailyRate: formatCurrency(dailyRate),
      subtotal: formatCurrency(subtotal),
      tax: formatCurrency(tax),
      total: formatCurrency(total),
    }
  };
};

// Get all orders
const getOrders = async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });

    const pagination = {
      currentPage: 1,
      totalPages: Math.ceil(orders.length / 10),
      totalItems: orders.length,
      itemsPerPage: 10,
    };

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const thisWeekOrders = orders.filter(
      (o) => new Date(o.createdAt) >= oneWeekAgo
    );
    const thisMonthOrders = orders.filter(
      (o) => new Date(o.createdAt) >= oneMonthAgo
    );

    const totalRevenue = orders
      .filter((o) => o.status === "completed")
      .reduce((acc, o) => {
        const amount = o.pricing?.total || 0;
        return acc + amount;
      }, 0);

    const stats = {
      thisWeek: thisWeekOrders.length,
      thisMonth: thisMonthOrders.length,
      totalRevenue: totalRevenue,
    };

    res.status(200).json({ 
      data: orders, 
      pagination, 
      stats 
    });
  } catch (error) {
    console.error("Get orders error:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch orders", error: error.message });
  }
};

// Create a new order - WITH WEBSOCKET NOTIFICATION
const createOrder = async (req, res) => {
  try {
    console.log("Creating order with data:", JSON.stringify(req.body, null, 2));

    if (!req.body || Object.keys(req.body).length === 0) {
      console.error("Request body is empty or undefined");
      return res.status(400).json({
        message: "Request body is empty or malformed",
        received: req.body,
      });
    }

    // Generate unique order ID and order number
    const lastOrder = await Order.findOne().sort({ id: -1 });
    const nextId = lastOrder ? lastOrder.id + 1 : 41489;
    
    req.body.id = nextId;
    req.body.orderNumber = `Order #${nextId}`;

    // Create the order
    const order = new Order(req.body);
    await order.save();

    console.log("Order created successfully:", order._id);

    // WEBSOCKET NOTIFICATION FOR NEW ORDER
    try {
      if (global.genericWebSocket) {
        global.genericWebSocket.broadcast({
          type: 'new_order',
          module: 'orders',
          data: {
            orderId: order._id,
            orderNumber: order.orderNumber,
            customerName: order.customerInfo.name,
            total: formatCurrency(order.pricing.total),
            items: order.items.length,
            status: order.status,
            timestamp: new Date().toISOString()
          }
        }, (client) => {
          return client.type === 'admin' && client.subscribedModules.has('orders');
        });
        console.log("WebSocket notification sent for new order:", order.orderNumber);
      }
    } catch (wsError) {
      console.error("Failed to send WebSocket notification:", wsError);
      // Don't fail the request if WebSocket fails
    }

    res.status(201).json(order);
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({
      message: "Failed to create order",
      error: error.message,
    });
  }
};

// Search orders
const searchOrders = async (req, res) => {
  try {
    const { status, orderNumber } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }

    if (orderNumber) {
      query.orderNumber = { $regex: orderNumber, $options: 'i' };
    }

    const orders = await Order.find(query).sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (error) {
    console.error('Search orders error:', error);
    res.status(500).json({ message: 'Server error while searching orders' });
  }
};

// Get single order by ID
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    res.status(200).json(order);
  } catch (error) {
    console.error("Get order by ID error:", error);
    res.status(500).json({
      message: "Failed to fetch order",
      error: error.message,
    });
  }
};

// Update order
const updateOrder = async (req, res) => {
  try {
    const updatedOrder = await Order.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!updatedOrder) return res.status(404).json({ message: 'Order not found' });

    // WEBSOCKET NOTIFICATION FOR ORDER UPDATE
    try {
      if (global.genericWebSocket) {
        global.genericWebSocket.broadcast({
          type: 'order_updated',
          module: 'orders',
          data: {
            orderId: updatedOrder._id,
            orderNumber: updatedOrder.orderNumber,
            customerName: updatedOrder.customerInfo.name,
            timestamp: new Date().toISOString()
          }
        }, (client) => {
          return client.type === 'admin' && client.subscribedModules.has('orders');
        });
        console.log("WebSocket notification sent for order update:", updatedOrder.orderNumber);
      }
    } catch (wsError) {
      console.error("Failed to send WebSocket notification:", wsError);
    }

    res.status(200).json({ message: 'Order updated successfully', order: updatedOrder });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ message: 'Server error while updating order' });
  }
};

// Update order status - WITH WEBSOCKET NOTIFICATION
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!["pending", "confirmed", "in_progress", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const oldStatus = order.status;
    order.status = status;
    await order.save();

    console.log(`Order ${order.orderNumber} status updated from ${oldStatus} to ${status}`);

    // WEBSOCKET NOTIFICATION FOR STATUS UPDATE
    try {
      if (global.genericWebSocket) {
        global.genericWebSocket.broadcast({
          type: 'order_status_updated',
          module: 'orders',
          data: {
            orderId: order._id,
            orderNumber: order.orderNumber,
            customerName: order.customerInfo.name,
            oldStatus,
            newStatus: status,
            timestamp: new Date().toISOString()
          }
        }, (client) => {
          return client.type === 'admin' && client.subscribedModules.has('orders');
        });
        console.log("WebSocket notification sent for status update:", order.orderNumber);
      }
    } catch (wsError) {
      console.error("Failed to send WebSocket notification:", wsError);
    }

    res.status(200).json({ status: order.status });
  } catch (error) {
    console.error("Update order status error:", error);
    res.status(500).json({
      message: "Failed to update status",
      error: error.message,
    });
  }
};

// Delete order - WITH WEBSOCKET NOTIFICATION
const deleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Store order info for notification
    const orderInfo = {
      orderId: order._id,
      orderNumber: order.orderNumber,
      customerName: order.customerInfo?.name,
      customerEmail: order.customerInfo?.email,
    };

    await Order.findByIdAndDelete(req.params.id);

    console.log(`Order ${orderInfo.orderNumber} deleted successfully`);

    // WEBSOCKET NOTIFICATION FOR ORDER DELETION
    try {
      if (global.genericWebSocket) {
        global.genericWebSocket.broadcast({
          type: 'order_deleted',
          module: 'orders',
          data: {
            orderId: orderInfo.orderId,
            orderNumber: orderInfo.orderNumber,
            customerName: orderInfo.customerName,
            timestamp: new Date().toISOString()
          }
        }, (client) => {
          return client.type === 'admin' && client.subscribedModules.has('orders');
        });
        console.log("WebSocket notification sent for order deletion:", orderInfo.orderNumber);
      }
    } catch (wsError) {
      console.error("Failed to send WebSocket notification:", wsError);
    }

    res.status(200).json({
      message: "Order deleted successfully",
      deletedOrderId: orderInfo.orderNumber,
    });
  } catch (error) {
    console.error("Delete order error:", error);
    res.status(500).json({
      message: "Failed to delete order",
      error: error.message,
    });
  }
};

// Generate and send order invoice
const sendOrderInvoice = async (req, res) => {
  try {
    const { orderId, customerEmail, customerName, dailyRate = 0 } = req.body;

    if (!orderId || !customerEmail) {
      return res.status(400).json({
        message: "Missing required fields: orderId and customerEmail",
      });
    }

    console.log("Sending order invoice email to:", customerEmail);

    // Fetch the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Calculate pricing with daily rates
    const pricingDetails = calculateOrderPricing(order, parseFloat(dailyRate) || 0);

    // Generate invoice data
    const invoiceData = {
      invoiceNumber: `INV-${order.orderNumber.replace('Order #', '')}`,
      issueDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
      
      // Company details
      company: {
        name: "iBloom Rentals",
        address: "123 Business Street",
        city: "Lagos",
        state: "Lagos State",
        country: "Nigeria",
        phone: "+234 (0) 123 456 7890",
        email: process.env.EMAIL_USER || "info@ibloomrentals.com",
        bankDetails: {
          bankName: "First Bank of Nigeria",
          accountName: "iBloom Rentals Limited",
          accountNumber: "3123456789",
          sortCode: "011151003"
        }
      },

      // Customer details
      customer: {
        name: order.customerInfo.name,
        email: order.customerInfo.email,
        phone: order.customerInfo.phone,
        address: order.deliveryInfo.address
      },

      // Order details
      order: {
        orderNumber: order.orderNumber,
        orderDate: order.createdAt,
        startDate: order.dateInfo.startDate,
        endDate: order.dateInfo.endDate,
        duration: pricingDetails.durationInDays,
        deliveryType: order.deliveryInfo.type,
        notes: order.notes
      },

      // Items
      items: order.items.map(item => ({
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        pricePerDay: item.pricePerDay,
        totalPrice: item.totalPrice,
        description: `${item.quantity} x ${formatCurrency(item.pricePerDay)} per day`
      })),

      // Pricing
      ...pricingDetails,

      // Additional services
      additionalServices: [
        {
          name: "Delivery Service",
          included: order.deliveryInfo.type === 'delivery',
          required: false
        },
        {
          name: "Professional Setup",
          included: false,
          required: false
        }
      ],

      requiresDeposit: pricingDetails.total > 50000,
      depositAmount: pricingDetails.total > 50000 ? pricingDetails.total * 0.5 : 0,
    };

    // Generate PDF buffer
    const pdfBuffer = await generateOrderInvoicePDF(invoiceData);

    // Send email with PDF attachment
    await sendOrderInvoiceEmail(customerEmail, customerName, invoiceData, pdfBuffer);

    // Update order with invoice info
    order.invoiceGenerated = true;
    order.invoiceNumber = invoiceData.invoiceNumber;
    order.invoiceSentAt = new Date();
    order.lastInvoiceUpdate = new Date();
    await order.save();

    res.status(200).json({
      message: "Order invoice sent successfully",
      sentTo: customerEmail,
      invoiceNumber: invoiceData.invoiceNumber,
      pricingDetails
    });
  } catch (error) {
    console.error("Failed to send order invoice:", error);
    res.status(500).json({
      message: "Failed to send order invoice",
      error: error.message,
    });
  }
};

// Generate PDF for order invoice
const generateOrderInvoicePDF = async (invoiceData) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40 });
      const buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on("error", reject);

      await generateOrderPDFContent(doc, invoiceData);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

// Generate PDF content for orders
const generateOrderPDFContent = async (doc, invoiceData) => {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 40;

  // Colors
  const primaryColor = "#4F46E5";
  const grayColor = "#6B7280";
  const darkColor = "#1F2937";

  // Header
  doc
    .fontSize(24)
    .fillColor(primaryColor)
    .text("ORDER INVOICE", margin, margin, { align: "left" });

  // Invoice details (top right)
  const headerY = margin;
  doc
    .fontSize(9)
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

  // Add logo
  const logoBase64 = await getLogoBase64();
  let logoAdded = false;

  if (logoBase64) {
    try {
      const logoBuffer = Buffer.from(logoBase64.split("base64,")[1], "base64");
      doc.image(logoBuffer, pageWidth - 110, headerY + 40, {
        width: 60,
        height: 60,
        fit: [60, 60],
        align: "center",
      });
      logoAdded = true;
    } catch (error) {
      console.error("Error adding logo to PDF:", error);
    }
  }

  if (!logoAdded) {
    doc
      .rect(pageWidth - 110, headerY + 40, 60, 60)
      .fillColor("#E5E7EB")
      .fill();
    doc
      .fontSize(10)
      .fillColor("#9CA3AF")
      .text("LOGO", pageWidth - 95, headerY + 65);
  }

  let currentY = headerY + 110;

  // From and To sections
  doc
    .fontSize(10)
    .fillColor(darkColor)
    .font("Helvetica-Bold")
    .text("From:", margin, currentY);

  doc
    .font("Helvetica")
    .fontSize(11)
    .text(invoiceData.company.name, margin, currentY + 15)
    .fontSize(8)
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

  currentY += 100;

  // Order Details Box
  doc
    .rect(margin, currentY, pageWidth - 2 * margin, 70)
    .fillColor("#F3F4F6")
    .fill();

  doc
    .fontSize(10)
    .fillColor(primaryColor)
    .font("Helvetica-Bold")
    .text("Order Details", margin + 10, currentY + 10);

  const orderY = currentY + 25;
  const orderCol1 = margin + 10;
  const orderCol2 = pageWidth / 2 + 20;

  doc
    .fontSize(8)
    .fillColor(darkColor)
    .font("Helvetica")
    .text(`Order: ${invoiceData.order.orderNumber}`, orderCol1, orderY)
    .text(
      `Rental Period: ${invoiceData.order.duration} days`,
      orderCol2,
      orderY
    )
    .text(`Start: ${new Date(invoiceData.order.startDate).toLocaleDateString()}`, orderCol1, orderY + 12)
    .text(`End: ${new Date(invoiceData.order.endDate).toLocaleDateString()}`, orderCol2, orderY + 12)
    .text(`Delivery: ${invoiceData.order.deliveryType.replace('_', ' ').toUpperCase()}`, orderCol1, orderY + 24)
    .text(`Daily Rate: ${invoiceData.formatted.dailyRate}`, orderCol2, orderY + 24);

  currentY += 85;

  // Items Table
  if (invoiceData.items && invoiceData.items.length > 0) {
    doc
      .fontSize(10)
      .fillColor(primaryColor)
      .font("Helvetica-Bold")
      .text("Rental Items", margin, currentY);

    currentY += 18;

    invoiceData.items.forEach((item, index) => {
      doc
        .fontSize(9)
        .fillColor(darkColor)
        .font("Helvetica-Bold")
        .text(`${item.name} (Qty: ${item.quantity})`, margin, currentY)
        .font("Helvetica")
        .text(
          formatCurrency(item.totalPrice),
          pageWidth - 120,
          currentY,
          { align: "right" }
        );

      if (item.description) {
        currentY += 12;
        doc
          .fontSize(7)
          .fillColor(grayColor)
          .text(item.description, margin, currentY, {
            width: pageWidth - 2 * margin - 120,
          });
      }

      currentY += 18;
    });
  }

  // Pricing breakdown
  currentY += 20;
  const totalsX = pageWidth - 250;
  const totalsY = currentY;

  // Draw totals background
  doc
    .rect(totalsX - 15, totalsY - 8, 230, 110)
    .fillColor("#F9FAFB")
    .fill();

  doc
    .fontSize(9)
    .fillColor(darkColor)
    .font("Helvetica")
    .text("Items Subtotal:", totalsX, totalsY)
    .text(invoiceData.formatted.itemsSubtotal, totalsX + 130, totalsY, { align: "right" })
    .text("Daily Charges:", totalsX, totalsY + 15)
    .text(invoiceData.formatted.dailyCharges, totalsX + 130, totalsY + 15, { align: "right" })
    .text("Subtotal:", totalsX, totalsY + 30)
    .text(invoiceData.formatted.subtotal, totalsX + 130, totalsY + 30, { align: "right" })
    .text("Tax (7.5%):", totalsX, totalsY + 45)
    .text(invoiceData.formatted.tax, totalsX + 130, totalsY + 45, { align: "right" });

  // Total line
  doc
    .moveTo(totalsX, totalsY + 58)
    .lineTo(totalsX + 200, totalsY + 58)
    .strokeColor(darkColor)
    .lineWidth(1)
    .stroke();

  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .fillColor(darkColor)
    .text("Total:", totalsX, totalsY + 65)
    .text(invoiceData.formatted.total, totalsX + 130, totalsY + 65, { align: "right" });

  // Deposit info if required
  if (invoiceData.requiresDeposit) {
    doc
      .fontSize(9)
      .fillColor("#EA580C")
      .font("Helvetica-Bold")
      .text("Deposit Required (50%):", totalsX, totalsY + 85)
      .text(
        formatCurrency(invoiceData.depositAmount),
        totalsX + 130,
        totalsY + 85,
        { align: "right" }
      );
  }

  // Bank Details Section
  if (invoiceData.company.bankDetails) {
    const bankY = totalsY;

    doc
      .rect(margin, bankY, pageWidth / 2 - 20, 110)
      .fillColor("#F0FDF4")
      .fill();

    doc
      .fontSize(10)
      .fillColor("#059669")
      .font("Helvetica-Bold")
      .text("Payment Information", margin + 10, bankY + 8);

    doc
      .fontSize(8)
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
      .text(`Reference: ${invoiceData.invoiceNumber}`, margin + 10, bankY + 58);

    if (invoiceData.company.bankDetails.sortCode) {
      doc.text(
        `Sort Code: ${invoiceData.company.bankDetails.sortCode}`,
        margin + 10,
        bankY + 70
      );
    }
  }

  currentY = totalsY + 120;

  // Footer
  doc
    .fontSize(10)
    .fillColor(darkColor)
    .font("Helvetica-Bold")
    .text("Thank you for your order!", margin, currentY, {
      align: "center",
      width: pageWidth - 2 * margin,
    });

  doc
    .fontSize(7)
    .fillColor(grayColor)
    .font("Helvetica")
    .text(
      `Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`,
      margin,
      currentY + 15,
      { align: "center", width: pageWidth - 2 * margin }
    );
};

// Send order invoice email
const sendOrderInvoiceEmail = async (customerEmail, customerName, invoiceData, pdfBuffer) => {
  const logoBase64 = await getLogoBase64();

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: customerEmail,
    subject: `Order Invoice ${invoiceData.invoiceNumber} - Your Rental Order`,
    html: generateOrderInvoiceEmailHTML(customerName, invoiceData, logoBase64),
    attachments: [
      {
        filename: `Order-Invoice-${invoiceData.invoiceNumber}.pdf`,
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
      cid: "companylogo",
    });
  }

  await transporter.sendMail(mailOptions);
  console.log(`Order invoice email sent to: ${customerEmail}`);
};

// Generate HTML content for order invoice email
const generateOrderInvoiceEmailHTML = (customerName, invoiceData, logoBase64) => {
  const logoImg = logoBase64
    ? `<img src="cid:companylogo" alt="Company Logo" style="width: 80px; height: 80px; object-fit: contain; border-radius: 8px;">`
    : `<div style="width: 80px; height: 80px; background: #E5E7EB; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #9CA3AF; font-weight: bold; font-size: 12px;">LOGO</div>`;

  const itemsHTML = invoiceData.items
    ? invoiceData.items
        .map((item) => `
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 8px 0; font-weight: bold;">${item.name}</td>
            <td style="padding: 8px 0; text-align: center;">${item.quantity}</td>
            <td style="padding: 8px 0; text-align: right;">${formatCurrency(item.totalPrice)}</td>
          </tr>
        `)
        .join("")
    : "";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Invoice</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%); color: white; padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 30px; position: relative;">
        <div style="position: absolute; top: 15px; right: 15px;">
          ${logoImg}
        </div>
        <h1 style="margin: 0; font-size: 28px;">Order Invoice Ready</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Your rental order invoice is attached</p>
      </div>

      <!-- Greeting -->
      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
        <h2 style="color: #1F2937; margin-top: 0;">Hello ${customerName}!</h2>
        <p style="margin: 0;">Thank you for your order! Please find your invoice attached for your rental order.</p>
      </div>

      <!-- Order Summary -->
      <div style="background: white; border: 2px solid #E5E7EB; border-radius: 10px; padding: 25px; margin-bottom: 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h3 style="color: #4F46E5; margin-top: 0;">Order Summary</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Invoice Number:</td>
            <td style="padding: 12px 0; font-weight: bold;">${invoiceData.invoiceNumber}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Order Number:</td>
            <td style="padding: 12px 0;">${invoiceData.order.orderNumber}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Rental Period:</td>
            <td style="padding: 12px 0;">${invoiceData.order.duration} days</td>
          </tr>
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Items Subtotal:</td>
            <td style="padding: 12px 0;">${invoiceData.formatted.itemsSubtotal}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Daily Charges:</td>
            <td style="padding: 12px 0;">${invoiceData.formatted.dailyCharges}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Tax (7.5%):</td>
            <td style="padding: 12px 0;">${invoiceData.formatted.tax}</td>
          </tr>
          <tr style="background: #F0FDF4;">
            <td style="padding: 15px 0; font-weight: bold; color: #166534; font-size: 16px;">Total Amount:</td>
            <td style="padding: 15px 0; font-weight: bold; color: #059669; font-size: 20px;">${invoiceData.formatted.total}</td>
          </tr>
        </table>
      </div>

      <!-- Items List -->
      ${itemsHTML ? `
      <div style="background: white; border: 2px solid #E5E7EB; border-radius: 10px; padding: 25px; margin-bottom: 25px;">
        <h3 style="color: #4F46E5; margin-top: 0;">Rental Items</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #F9FAFB;">
              <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #E5E7EB;">Item</th>
              <th style="padding: 12px 8px; text-align: center; border-bottom: 2px solid #E5E7EB;">Qty</th>
              <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #E5E7EB;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>
      </div>
      ` : ""}

      <!-- Payment Instructions -->
      <div style="background: #EFF6FF; border: 2px solid #DBEAFE; border-radius: 10px; padding: 25px; margin-bottom: 25px;">
        <h3 style="color: #1E40AF; margin-top: 0;">Payment Instructions</h3>
        <div style="color: #1E3A8A;">
          <p style="margin-bottom: 15px;"><strong>Payment Methods Accepted:</strong></p>
          <ul style="margin: 0; padding-left: 20px;">
            <li style="margin-bottom: 8px;">Bank Transfer (Preferred)</li>
            <li style="margin-bottom: 8px;">Cash payment (upon delivery)</li>
            <li style="margin-bottom: 8px;">Mobile money transfers</li>
          </ul>
          ${invoiceData.company.bankDetails ? `
          <div style="background: white; padding: 15px; border-radius: 6px; margin-top: 15px; border-left: 4px solid #3B82F6;">
            <p style="margin: 0; font-weight: bold; color: #1E40AF;">Bank Details:</p>
            <p style="margin: 5px 0 0 0; font-size: 14px;">
              Bank: ${invoiceData.company.bankDetails.bankName}<br>
              Account Name: ${invoiceData.company.bankDetails.accountName}<br>
              Account Number: ${invoiceData.company.bankDetails.accountNumber}<br>
              ${invoiceData.company.bankDetails.sortCode ? `Sort Code: ${invoiceData.company.bankDetails.sortCode}<br>` : ""}
              Reference: ${invoiceData.invoiceNumber}
            </p>
          </div>
          ` : ""}
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
      </div>
    </body>
    </html>
  `;
};

const downloadOrderInvoice = async (req, res) => {
  try {
    const { orderId, customerEmail, customerName, dailyRate = 0 } = req.body;

    if (!orderId) {
      return res.status(400).json({
        message: "Missing required field: orderId",
      });
    }

    // Fetch the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Calculate pricing with daily rates
    const pricingDetails = calculateOrderPricing(order, parseFloat(dailyRate) || 0);

    // Generate invoice data (same as above)
    const invoiceData = {
      invoiceNumber: `INV-${order.orderNumber.replace('Order #', '')}`,
      issueDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      
      company: {
        name: "iBloom Rentals",
        address: "123 Business Street",
        city: "Lagos",
        state: "Lagos State",
        country: "Nigeria",
        phone: "+234 (0) 123 456 7890",
        email: process.env.EMAIL_USER || "info@ibloomrentals.com",
        bankDetails: {
          bankName: "First Bank of Nigeria",
          accountName: "iBloom Rentals Limited",
          accountNumber: "3123456789",
          sortCode: "011151003"
        }
      },

      customer: {
        name: order.customerInfo.name,
        email: order.customerInfo.email,
        phone: order.customerInfo.phone,
        address: order.deliveryInfo.address
      },

      order: {
        orderNumber: order.orderNumber,
        orderDate: order.createdAt,
        startDate: order.dateInfo.startDate,
        endDate: order.dateInfo.endDate,
        duration: pricingDetails.durationInDays,
        deliveryType: order.deliveryInfo.type,
        notes: order.notes
      },

      items: order.items.map(item => {
        const itemPrice = getItemPrice(item);
        const quantity = safeParseFloat(item.quantity, 1);
        const itemTotal = itemPrice * quantity;
        
        return {
          name: item.name,
          category: item.category,
          quantity: quantity,
          pricePerDay: itemPrice,
          totalPrice: itemTotal,
          description: `${quantity} x ${formatCurrency(itemPrice)} per unit`
        };
      }),

      ...pricingDetails,

      requiresDeposit: pricingDetails.total > 50000,
      depositAmount: pricingDetails.total > 50000 ? pricingDetails.total * 0.5 : 0,
    };

    // Generate PDF buffer
    const pdfBuffer = await generateOrderInvoicePDF(invoiceData);

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoiceData.invoiceNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF buffer
    res.send(pdfBuffer);

  } catch (error) {
    console.error("Failed to download order invoice:", error);
    res.status(500).json({
      message: "Failed to download order invoice",
      error: error.message,
    });
  }
};

module.exports = {
  getOrders,
  getOrderById,
  createOrder,
  updateOrder,
  deleteOrder,
  searchOrders,
  updateOrderStatus,
  sendOrderInvoice,
   downloadOrderInvoice
};
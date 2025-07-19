const express = require('express');
const router = express.Router();

const {
  getOrders,
  getOrderById,
  createOrder,
  updateOrder,
  deleteOrder,
  searchOrders
} = require('../controllers/orderController');

const auth = require('../middleware/auth'); 

router.get('/', getOrders);
router.get('/search', searchOrders);
router.get('/:id', getOrderById);
router.post('/', auth, createOrder);
router.put('/:id', auth, updateOrder);
router.delete('/:id', auth, deleteOrder);

module.exports = router;

const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  price: { type: String, default: '' },
  image: { type: String, default: '' }
});

const CategorySchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    image: { type: String, default: '' },
    description: { type: String, trim: true, default: '' },
    itemCount: { type: Number, default: 0 },
    hasQuotes: { type: Boolean, default: false },
    items: [ItemSchema]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Category', CategorySchema);

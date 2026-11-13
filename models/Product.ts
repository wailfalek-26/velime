import mongoose, { Schema, Model } from 'mongoose';
import { Product as ProductType } from '@/types';

export interface IProductDocument extends Omit<ProductType, 'id'> {
  id: string;
}

const StockVariantSchema = new Schema(
  {
    size: { type: String, required: true },
    color: { type: String, required: true },
    inStock: { type: Boolean, default: true },
    quantity: { type: Number, default: 0 },
  },
  { _id: false }
);

const ProductSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    slug: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    originalPrice: { type: Number },
    image: { type: String, required: true },
    images: { type: [String], default: [] },
    category: { type: String, required: true, index: true },
    description: { type: String, default: '' },
    sizes: { type: [String], default: ['S', 'M', 'L'] },
    availableSizes: { type: [String], default: undefined },
    colors: { type: [String], default: undefined },
    availableColors: { type: [String], default: undefined },
    stockMatrix: { type: [StockVariantSchema], default: undefined },
    inStock: { type: Boolean, default: true },
    stockStatus: {
      type: String,
      enum: ['in_stock', 'partial_out', 'total_out'],
      default: 'in_stock',
    },
    badge: { type: String },
    isNew: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    suppressReservedKeysWarning: true,
    toJSON: {
      transform: (_doc, ret: any) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const ProductModel: Model<IProductDocument> =
  mongoose.models.Product || mongoose.model<IProductDocument>('Product', ProductSchema);

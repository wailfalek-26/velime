import mongoose, { Schema, Model } from 'mongoose';
import { Order as OrderType, OrderItem as OrderItemType } from '@/types';

export interface IOrderDocument extends Omit<OrderType, 'id'> {
  id: string;
}

const OrderItemSchema = new Schema(
  {
    productId: { type: String, required: true },
    productSlug: { type: String },
    productName: { type: String, required: true },
    productImage: { type: String, default: '' },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    size: { type: String, required: true },
    color: { type: String },
  },
  { _id: false }
);

const OrderSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    orderNumber: { type: String, required: true, unique: true, index: true },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    wilayaCode: { type: String, required: true },
    wilayaName: { type: String, required: true },
    commune: { type: String, required: true },
    deliveryType: { type: String, enum: ['domicile', 'bureau'], required: true },
    items: { type: [OrderItemSchema], required: true },
    itemsSubtotal: { type: Number, required: true },
    deliveryCost: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['en_attente', 'confirmee', 'annulee'],
      default: 'en_attente',
    },
    notes: { type: String, default: '' },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: any) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const OrderModel: Model<IOrderDocument> =
  mongoose.models.Order || mongoose.model<IOrderDocument>('Order', OrderSchema);

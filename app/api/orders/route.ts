import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { OrderModel } from '@/models/Order';
import { sendOrderNotification } from '@/lib/notifications';

export async function GET() {
  try {
    await connectToDatabase();
    const orders = await OrderModel.find({}).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, orders });
  } catch (error: any) {
    console.error('GET /api/orders error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const orderData = await req.json();

    if (!orderData.customerName || !orderData.customerPhone || !orderData.items || !orderData.totalAmount) {
      return NextResponse.json(
        { success: false, error: 'Missing required order fields' },
        { status: 400 }
      );
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const id = orderData.id || `ord-${Date.now()}-${randomSuffix}`;
    const orderNumber = orderData.orderNumber || `CMD-${randomSuffix}`;
    const status = orderData.status || 'en_attente';
    const createdAt = orderData.createdAt || new Date().toISOString();

    const newOrder = await OrderModel.create({
      ...orderData,
      id,
      orderNumber,
      status,
      createdAt,
    });

    // Dispatch background notification
    const origin = req.nextUrl.origin;
    sendOrderNotification(newOrder.toObject(), origin).catch((err) => {
      console.warn('Push notification delivery note:', err);
    });

    return NextResponse.json({ success: true, order: newOrder });
  } catch (error: any) {
    console.error('POST /api/orders error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to create order' },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ProductModel } from '@/models/Product';

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');

    const query: any = {};
    if (category && category !== 'all') {
      query.category = category;
    }

    const products = await ProductModel.find(query).sort({ createdAt: -1 }).lean();

    return NextResponse.json({
      success: true,
      products,
    });
  } catch (error: any) {
    console.error('GET /api/products error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch products' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const productData = await req.json();

    if (!productData.id || !productData.name || !productData.price) {
      return NextResponse.json(
        { success: false, error: 'Missing required product fields (id, name, price)' },
        { status: 400 }
      );
    }

    const updated = await ProductModel.findOneAndUpdate(
      { id: productData.id },
      { $set: productData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return NextResponse.json({
      success: true,
      product: updated,
    });
  } catch (error: any) {
    console.error('POST /api/products error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to save product' },
      { status: 500 }
    );
  }
}


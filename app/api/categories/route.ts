import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { CategoryModel } from '@/models/Category';

export async function GET() {
  try {
    await connectToDatabase();
    const categories = await CategoryModel.find({}).sort({ name: 1 }).lean();
    return NextResponse.json({ success: true, categories });
  } catch (error: any) {
    console.error('GET /api/categories error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const categoryData = await req.json();

    if (!categoryData.id || !categoryData.name) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields (id, name)' },
        { status: 400 }
      );
    }

    const updated = await CategoryModel.findOneAndUpdate(
      { id: categoryData.id },
      { $set: categoryData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return NextResponse.json({ success: true, category: updated });
  } catch (error: any) {
    console.error('POST /api/categories error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to save category' },
      { status: 500 }
    );
  }
}


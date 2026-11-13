import { Product, Category, Order, OrderStatus } from '@/types';
import { SiteData } from '@/context/SiteDataContext';

function getBaseUrl(): string {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}

// Helper for safe JSON fetching
async function fetchJson<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const fullUrl = path.startsWith('http') ? path : `${getBaseUrl()}${path}`;
    const res = await fetch(fullUrl, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.warn(`API Error [${res.status}] ${path}:`, errBody);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error(`Fetch exception for ${path}:`, err);
    return null;
  }
}

// ============================================================
// PRODUCTS API
// ============================================================

export async function fetchProductsApi(category?: string): Promise<Product[] | null> {
  if (typeof window === 'undefined') {
    try {
      const { connectToDatabase } = await import('@/lib/mongodb');
      const { ProductModel } = await import('@/models/Product');
      await connectToDatabase();
      const query: any = {};
      if (category && category !== 'all') query.category = category;
      const products = await ProductModel.find(query).sort({ createdAt: -1 }).lean();
      return products as unknown as Product[];
    } catch {
      return null;
    }
  }

  const url = category && category !== 'all' ? `/api/products?category=${encodeURIComponent(category)}` : '/api/products';
  const data = await fetchJson<{ success: boolean; products: Product[] }>(url);
  return data?.success && Array.isArray(data.products) ? data.products : null;
}

export async function fetchProductByIdApi(id: string): Promise<Product | null> {
  if (typeof window === 'undefined') {
    try {
      const { connectToDatabase } = await import('@/lib/mongodb');
      const { ProductModel } = await import('@/models/Product');
      await connectToDatabase();
      const product = await ProductModel.findOne({ $or: [{ id }, { slug: id }] }).lean();
      return (product as unknown as Product) || null;
    } catch {
      return null;
    }
  }

  const data = await fetchJson<{ success: boolean; product: Product }>(`/api/products/${encodeURIComponent(id)}`);
  return data?.success && data.product ? data.product : null;
}

export async function saveProductApi(product: Product): Promise<boolean> {
  const data = await fetchJson<{ success: boolean; product: Product }>('/api/products', {
    method: 'POST',
    body: JSON.stringify(product),
  });
  return Boolean(data?.success);
}

export async function updateProductStockApi(
  productId: string,
  stockStatus: Product['stockStatus'],
  inStock: boolean,
  badge?: string,
  stockMatrix?: any[],
  availableSizes?: string[],
  availableColors?: string[]
): Promise<boolean> {
  const payload: any = {
    stockStatus,
    inStock,
  };
  if (badge !== undefined) payload.badge = badge;
  if (stockMatrix !== undefined) payload.stockMatrix = stockMatrix;
  if (availableSizes !== undefined) payload.availableSizes = availableSizes;
  if (availableColors !== undefined) payload.availableColors = availableColors;

  const data = await fetchJson<{ success: boolean }>(`/api/products/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return Boolean(data?.success);
}

export async function deleteProductApi(productId: string): Promise<boolean> {
  const data = await fetchJson<{ success: boolean }>(`/api/products/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
  });
  return Boolean(data?.success);
}

// ============================================================
// CATEGORIES API
// ============================================================

export async function fetchCategoriesApi(): Promise<Category[] | null> {
  if (typeof window === 'undefined') {
    try {
      const { connectToDatabase } = await import('@/lib/mongodb');
      const { CategoryModel } = await import('@/models/Category');
      await connectToDatabase();
      const categories = await CategoryModel.find({}).sort({ name: 1 }).lean();
      return categories as unknown as Category[];
    } catch {
      return null;
    }
  }

  const data = await fetchJson<{ success: boolean; categories: Category[] }>('/api/categories');
  return data?.success && Array.isArray(data.categories) ? data.categories : null;
}

export async function saveCategoryApi(category: Category): Promise<boolean> {
  const data = await fetchJson<{ success: boolean }>('/api/categories', {
    method: 'POST',
    body: JSON.stringify(category),
  });
  return Boolean(data?.success);
}

export async function deleteCategoryApi(categoryId: string): Promise<boolean> {
  const data = await fetchJson<{ success: boolean }>(`/api/categories/${encodeURIComponent(categoryId)}`, {
    method: 'DELETE',
  });
  return Boolean(data?.success);
}

// ============================================================
// SITE SETTINGS API (Hero, Brands, Lookbook)
// ============================================================

export async function fetchSiteSettingsApi(): Promise<{
  heroTitle?: string;
  heroSubtitle?: string;
  heroCtaText?: string;
  heroImage?: string;
  brands?: string[];
  lookbookPhotos?: string[];
} | null> {
  if (typeof window === 'undefined') {
    try {
      const { connectToDatabase } = await import('@/lib/mongodb');
      const { SiteSettingsModel } = await import('@/models/SiteSettings');
      await connectToDatabase();
      const settings = await SiteSettingsModel.findOne({ key: 'default' }).lean();
      return (settings as any) || null;
    } catch {
      return null;
    }
  }

  const data = await fetchJson<{ success: boolean; settings: any }>('/api/settings');
  return data?.success && data.settings ? data.settings : null;
}

export async function saveSiteSettingsApi(settings: {
  heroTitle?: string;
  heroSubtitle?: string;
  heroCtaText?: string;
  heroImage?: string;
  brands?: string[];
  lookbookPhotos?: string[];
}): Promise<boolean> {
  const data = await fetchJson<{ success: boolean }>('/api/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
  return Boolean(data?.success);
}

// ============================================================
// BULK SYNC API (Sync entire site data to MongoDB)
// ============================================================

export async function syncAllToMongoApi(siteData: Partial<SiteData>): Promise<{ success: boolean; message?: string }> {
  const data = await fetchJson<{ success: boolean; message?: string }>('/api/sync', {
    method: 'POST',
    body: JSON.stringify(siteData),
  });
  return {
    success: Boolean(data?.success),
    message: data?.message,
  };
}

// ============================================================
// ORDERS API
// ============================================================

export async function fetchOrdersApi(): Promise<Order[]> {
  if (typeof window === 'undefined') {
    try {
      const { connectToDatabase } = await import('@/lib/mongodb');
      const { OrderModel } = await import('@/models/Order');
      await connectToDatabase();
      const orders = await OrderModel.find({}).sort({ createdAt: -1 }).lean();
      return orders as unknown as Order[];
    } catch {
      return [];
    }
  }

  const data = await fetchJson<{ success: boolean; orders: Order[] }>('/api/orders');
  return data?.success && Array.isArray(data.orders) ? data.orders : [];
}

export async function createOrderApi(orderPayload: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'status'>): Promise<Order | null> {
  const data = await fetchJson<{ success: boolean; order: Order }>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(orderPayload),
  });
  return data?.success && data.order ? data.order : null;
}

export async function updateOrderStatusApi(orderId: string, status: OrderStatus): Promise<boolean> {
  const data = await fetchJson<{ success: boolean }>(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return Boolean(data?.success);
}

export async function deleteOrderApi(orderId: string): Promise<boolean> {
  const data = await fetchJson<{ success: boolean }>(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: 'DELETE',
  });
  return Boolean(data?.success);
}

// ============================================================
// CLOUDFLARE R2 IMAGE UPLOAD API
// ============================================================

export async function uploadImageToR2(
  fileOrBlob: Blob | File,
  folder: 'products' | 'categories' | 'hero' | 'lookbook' = 'products',
  originalFileName?: string
): Promise<{ success: boolean; url: string; key?: string; error?: string }> {
  try {
    const formData = new FormData();
    const fileName = originalFileName || (fileOrBlob instanceof File ? fileOrBlob.name : 'upload.webp');
    formData.append('file', fileOrBlob, fileName);
    formData.append('folder', folder);

    const fullUrl = `${getBaseUrl()}/api/upload`;
    const res = await fetch(fullUrl, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      return {
        success: false,
        url: '',
        error: data.error || `Erreur d'upload R2 (${res.status})`,
      };
    }

    return {
      success: true,
      url: data.url,
      key: data.key,
    };
  } catch (err: any) {
    console.error('R2 upload exception:', err);
    return {
      success: false,
      url: '',
      error: err?.message || "Erreur de connexion lors de l'envoi vers Cloudflare R2",
    };
  }
}

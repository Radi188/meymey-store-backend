import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class StorefrontService {
  constructor(
    private supabaseService: SupabaseService,
    private notificationsService: NotificationsService,
  ) {}

  private async getSingleStoreId(): Promise<string> {
    const { data: store, error } = await this.supabaseService
      .getAdminClient()
      .from('stores')
      .select('id')
      .limit(1)
      .single();

    if (error || !store) {
      throw new NotFoundException('No store found');
    }
    return store.id;
  }

  async getStores() {
    try {
      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('stores')
        .select('*')
        .order('store_name', { ascending: true });

      if (error) {
        console.error('getStores error:', error);
        throw error;
      }
      return data ?? [];
    } catch (e) {
      console.error('getStores catch:', e);
      throw e;
    }
  }

  async getStore() {
    const storeId = await this.getSingleStoreId();
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .single();

    if (error || !data) throw new NotFoundException(`Store not found`);
    return data;
  }

  async getProducts(params?: { brandId?: string }) {
    const storeId = await this.getSingleStoreId();
    let query = this.supabaseService
      .getAdminClient()
      .from('products')
      .select(
        '*, category:categories!products_category_id_fkey(*), brand:brands(*), uom:uom(*), stock:stock_batches(quantity_remaining, variant_id), variants:product_variants(*)',
      )
      .eq('store_id', storeId)
      .eq('is_hidden', false);

    if (params?.brandId && params.brandId !== 'all') {
      query = query.eq('brand_id', params.brandId);
    }

    const { data, error } = await query.order('created_at', {
      ascending: false,
    });

    if (error) throw error;

    return (data ?? []).map((product: any) => {
      const stockBatches = product.stock || [];
      const totalStock = stockBatches.reduce(
        (sum: number, b: any) => sum + (b.quantity_remaining || 0),
        0,
      );
      const variantsWithStock = product.variants?.map((v: any) => ({
        ...v,
        stock_level: stockBatches
          .filter((b: any) => b.variant_id === v.id)
          .reduce(
            (sum: number, b: any) => sum + (b.quantity_remaining || 0),
            0,
          ),
      }));
      return {
        ...product,
        stock_level: totalStock,
        variants: variantsWithStock,
        stock: undefined,
      };
    });
  }

  async getProduct(productId: string) {
    const storeId = await this.getSingleStoreId();
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('products')
      .select(
        '*, category:categories!products_category_id_fkey(*), brand:brands(*), uom:uom(*), stock:stock_batches(quantity_remaining, variant_id), variants:product_variants(*)',
      )
      .eq('id', productId)
      .eq('store_id', storeId)
      .eq('is_hidden', false)
      .single();

    if (error || !data) throw new NotFoundException(`Product not found`);

    const stockBatches = data.stock || [];
    const totalStock = stockBatches.reduce(
      (sum: number, b: any) => sum + (b.quantity_remaining || 0),
      0,
    );
    const variantsWithStock = data.variants?.map((v: any) => ({
      ...v,
      stock_level: stockBatches
        .filter((b: any) => b.variant_id === v.id)
        .reduce((sum: number, b: any) => sum + (b.quantity_remaining || 0), 0),
    }));

    return {
      ...data,
      stock_level: totalStock,
      variants: variantsWithStock,
      stock: undefined,
    };
  }

  async getCategories() {
    const storeId = await this.getSingleStoreId();
    // Get category IDs for products in this store
    const { data: products } = await this.supabaseService
      .getAdminClient()
      .from('products')
      .select('category_id')
      .eq('store_id', storeId)
      .eq('is_hidden', false)
      .not('category_id', 'is', null);

    const categoryIds = [
      ...new Set((products ?? []).map((p: any) => p.category_id)),
    ];

    if (categoryIds.length === 0) return [];

    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('categories')
      .select('*')
      .in('id', categoryIds)
      .order('name', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  async placeOrder(orderDto: any) {
    const storeId = await this.getSingleStoreId();
    const { customer_name, customer_phone, notes, items } = orderDto;

    // Calculate total from items
    let total = 0;
    const orderItems: Array<{
      product_id: string;
      variant_id: string | null;
      quantity: number;
      unit_price: number;
      subtotal: number;
    }> = [];

    for (const item of items) {
      const productData = await this.getProduct(item.product_id);
      const price = item.variant_id
        ? (productData.variants?.find((v: any) => v.id === item.variant_id)
            ?.price ?? productData.price)
        : productData.price;

      total += price * item.quantity;
      orderItems.push({
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        quantity: item.quantity,
        unit_price: price,
        subtotal: price * item.quantity,
      });
    }

    // Insert a sales order
    const { data: order, error: orderError } = await this.supabaseService
      .getAdminClient()
      .from('sales_orders')
      .insert({
        store_id: storeId,
        customer_name,
        customer_phone,
        notes,
        total_amount: total,
        status: 'pending',
        source: 'storefront',
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Insert order items
    const itemsWithOrderId = orderItems.map((i) => ({
      ...i,
      order_id: order.id,
    }));
    await this.supabaseService
      .getAdminClient()
      .from('sales_order_items')
      .insert(itemsWithOrderId);

    // Trigger notification
    try {
      await this.notificationsService.create(
        {
          type: 'new_order',
          title: 'New Online Order',
          message: `A new order has been placed by ${customer_name || 'a customer'} for a total of ${total}`,
          data: {
            order_id: order.id,
            customer_name,
            total_amount: total,
            source: 'storefront',
          },
        },
        storeId,
      );
    } catch (e) {
      console.error('Failed to trigger notification:', e);
    }

    return { order_id: order.id, total_amount: total, status: 'pending' };
  }
  async getHomepage() {
    // Run all 3 queries in parallel
    const [productsResult, categoriesResult, brandsResult] = await Promise.all([
      // Fetch more products so we have enough to group by category (e.g., latest 200)
      this.supabaseService
        .getAdminClient()
        .from('products')
        .select(
          '*, category:categories!products_category_id_fkey(*), brand:brands(*), stock:stock_batches(quantity_remaining)',
        )
        .eq('is_hidden', false)
        .order('created_at', { ascending: false })
        .limit(200),

      // All categories
      this.supabaseService
        .getAdminClient()
        .from('categories')
        .select('*')
        .order('name', { ascending: true }),

      // All brands
      this.supabaseService
        .getAdminClient()
        .from('brands')
        .select('*')
        .order('name', { ascending: true }),
    ]);

    if (productsResult.error) throw productsResult.error;
    if (categoriesResult.error) throw categoriesResult.error;
    if (brandsResult.error) throw brandsResult.error;

    const toSlug = (name: string) =>
      (name ?? '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const mapProduct = (p: any) => {
      const stockBatches = p.stock || [];
      const totalStock = stockBatches.reduce(
        (sum: number, b: any) => sum + (b.quantity_remaining || 0),
        0,
      );

      // Build images array: prefer image_urls array, fallback to image_url
      const images: string[] =
        Array.isArray(p.image_urls) && p.image_urls.length > 0
          ? p.image_urls
          : p.image_url
            ? [p.image_url]
            : [];

      return {
        id: p.id,
        name: p.name,
        slug: toSlug(p.name),
        brand: p.brand?.name ?? null,
        brand_id: p.brand_id ?? null,
        category: p.category?.name ?? null,
        category_id: p.category_id ?? null,
        price: p.price ?? null,
        originalPrice: p.cost ?? null,
        description: p.description ?? null,
        images,
        rating: null,
        reviewCount: null,
        badge: null,
        inStock: totalStock > 0,
        stock_level: totalStock,
        skinType: null,
        volume: null,
        sku: p.sku,
      };
    };

    const allProducts = (productsResult.data ?? []).map(mapProduct);

    // Group products by category
    const categories = (categoriesResult.data ?? []).map((c: any) => {
      const categoryProducts = allProducts
        .filter((p) => p.category_id === c.id)
        .slice(0, 8); // Top 8 products per category

      return {
        id: c.id,
        name: c.name,
        slug: toSlug(c.name),
        description: c.description ?? null,
        icon: c.image_url ?? null,
        products: categoryProducts,
      };
    });

    // Also keep the flat list of the very latest products for a "New Arrivals" section
    const featuredProducts = allProducts.slice(0, 12);

    const brands = (brandsResult.data ?? []).map((b: any) => ({
      id: b.id,
      name: b.name,
      slug: toSlug(b.name),
      country: b.country ?? null,
      description: b.description ?? null,
      icon: b.logo_url ?? null,
    }));

    return { featuredProducts, categories, brands };
  }
}

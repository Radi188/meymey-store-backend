import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  BatchUpdateBrandDto,
  BatchUpdateCategoryDto,
} from './dto/batch-update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Returns true if a search token looks like an acronym (e.g. "boj", "hm").
   * Heuristic: 2–5 letters, all alphabetic.
   */
  private isLikelyAcronym(token: string): boolean {
    return token.length >= 2 && token.length <= 5 && /^[a-zA-Z]+$/.test(token);
  }

  /**
   * Builds a PostgreSQL POSIX regex that matches a product name where each
   * letter of `token` is the start of a consecutive word.
   * e.g. "boj" → "\mb[^ -]*[ -]+\mo[^ -]*[ -]+\mj[^ -]*"
   * which matches "Beauty Of Josoen-Sun Cream" (case-insensitive via ~*)
   */
  private buildAcronymRegex(token: string): string {
    const letters = token.toLowerCase().split('');
    return letters
      .map((letter, i) => {
        const part = `\\m${letter}[^ -]*`;
        return i < letters.length - 1 ? part + '[ -]+' : part;
      })
      .join('');
  }

  /**
   * Applies token-aware smart search filters to a Supabase query.
   * Each token is AND-ed (chained filter calls).
   * Short tokens also try acronym regex matching.
   * `includeDescription` — set false for tables without a description column.
   */
  private applySearchFilters(
    query: any,
    search: string,
    includeDescription = true,
  ): any {
    const tokens = search.trim().split(/\s+/).filter(Boolean);

    for (const token of tokens) {
      const baseCondition = includeDescription
        ? `name.ilike.%${token}%,sku.ilike.%${token}%,description.ilike.%${token}%`
        : `name.ilike.%${token}%,sku.ilike.%${token}%`;

      if (this.isLikelyAcronym(token)) {
        const acronymRegex = this.buildAcronymRegex(token);
        query = query.or(`${baseCondition},name.imatch.${acronymRegex}`);
      } else {
        query = query.or(baseCondition);
      }
    }

    return query;
  }

  private mapProduct(product: any) {
    if (!product) return null;
    const stockBatches = product.stock || [];
    const totalStock = stockBatches.reduce(
      (sum: number, batch: any) => sum + (batch.quantity_remaining || 0),
      0,
    );
    const variantsWithStock = product.variants?.map((variant: any) => ({
      ...variant,
      stock_level: stockBatches
        .filter((batch: any) => batch.variant_id === variant.id)
        .reduce(
          (sum: number, batch: any) => sum + (batch.quantity_remaining || 0),
          0,
        ),
    }));

    const categories = (product.all_categories || [])
      .map((pc: any) => pc.category)
      .filter(Boolean);

    // Compute stock level in each configured UOM so the frontend doesn't have to divide.
    // stock_level is always in base units; each UOM entry shows floor(stock / factor).
    const uomConversions = product.uom_conversions || [];
    const stockByUom = uomConversions.map((conv: any) => ({
      uom_id: conv.uom_id,
      uom: conv.uom,
      conversion_factor: conv.conversion_factor,
      price: conv.price,
      is_base_uom: conv.is_base_uom,
      is_purchase_uom: conv.is_purchase_uom,
      stock_level: conv.is_base_uom
        ? totalStock
        : Math.floor(totalStock / conv.conversion_factor),
    }));

    return {
      ...product,
      categories: categories.length > 0 ? categories : product.category ? [product.category] : [],
      all_categories: undefined,
      stock_level: totalStock,       // always in base units
      stock_by_uom: stockByUom,      // stock expressed in each configured UOM
      variants: variantsWithStock,
      stock: undefined,
    };
  }

  private async syncProductCategories(productId: string, categoryIds: string[]) {
    await this.supabaseService
      .getAdminClient()
      .from('product_categories')
      .delete()
      .eq('product_id', productId);

    if (categoryIds.length > 0) {
      const rows = categoryIds.map((cId) => ({
        product_id: productId,
        category_id: cId,
      }));
      await this.supabaseService
        .getAdminClient()
        .from('product_categories')
        .insert(rows);
    }
  }

  private async attachPackageStockLevel(packages: any[]): Promise<any[]> {
    const productIds = [
      ...new Set(
        packages.flatMap((pkg: any) =>
          (pkg.items ?? []).map((i: any) => i.product_id).filter(Boolean),
        ),
      ),
    ];
    if (productIds.length === 0)
      return packages.map((p) => ({ ...p, stock_level: 0 }));

    const { data: batches } = await this.supabaseService
      .getAdminClient()
      .from('stock_batches')
      .select('product_id, variant_id, quantity_remaining')
      .in('product_id', productIds)
      .gt('quantity_remaining', 0);

    const stockMap = new Map<string, number>();
    for (const b of batches ?? []) {
      const key = `${b.product_id}::${b.variant_id ?? 'base'}`;
      stockMap.set(key, (stockMap.get(key) ?? 0) + (b.quantity_remaining || 0));
    }

    return packages.map((pkg: any) => {
      if (!pkg.items || pkg.items.length === 0)
        return { ...pkg, stock_level: 0, cost: 0 };
      let min = Infinity;
      let totalCost = 0;
      for (const item of pkg.items) {
        const available =
          stockMap.get(`${item.product_id}::${item.variant_id ?? 'base'}`) ?? 0;
        min = Math.min(min, Math.floor(available / (item.quantity || 1)));
        const unitCost = item.variant?.cost ?? item.product?.cost ?? 0;
        totalCost += unitCost * (item.quantity || 1);
      }
      return {
        ...pkg,
        stock_level: min === Infinity ? 0 : min,
        cost: totalCost,
      };
    });
  }

  private async getRecommendations(currentProduct: any, limit: number = 4) {
    const recommendations: any[] = [];
    const usedIds = new Set<string>([currentProduct.id]);

    // 1. Same Category
    if (currentProduct.category_id) {
      const { data: catProducts } = await this.supabaseService
        .getAdminClient()
        .from('products')
        .select(
          '*, category:categories!products_category_id_fkey(*), all_categories:product_categories(category:categories!product_categories_category_id_fkey(*)), brand:brands(*), uom:uom(*), uom_conversions:product_uom_conversions(*, uom:uom(*)), stock:stock_batches(quantity_remaining, variant_id), variants:product_variants(*)',
        )
        .eq('category_id', currentProduct.category_id)
        .eq('is_hidden', false)
        .neq('id', currentProduct.id)
        .limit(limit);

      if (catProducts) {
        catProducts.forEach((p) => {
          if (!usedIds.has(p.id)) {
            recommendations.push(this.mapProduct(p));
            usedIds.add(p.id);
          }
        });
      }
    }

    // 2. Same Brand
    const { data: brandProducts } = await this.supabaseService
      .getAdminClient()
      .from('products')
      .select(
        '*, category:categories!products_category_id_fkey(*), all_categories:product_categories(category:categories!product_categories_category_id_fkey(*)), brand:brands(*), uom:uom(*), uom_conversions:product_uom_conversions(*, uom:uom(*)), stock:stock_batches(quantity_remaining, variant_id), variants:product_variants(*)',
      )
      .eq('brand_id', currentProduct.brand_id)
      .eq('is_hidden', false)
      .neq('id', currentProduct.id)
      .limit(limit - recommendations.length);

    if (brandProducts) {
      brandProducts.forEach((p) => {
        if (!usedIds.has(p.id)) {
          recommendations.push(this.mapProduct(p));
          usedIds.add(p.id);
        }
      });
    }

    // 3. Most in stock (Fallback)
    // Note: Ordering by stock_batches quantity_remaining directly is tricky due to join.
    // We'll fetch more products and sort them in memory or just fetch recent ones if stock join is complex.
    // For now, let's fetch products with stock info and sort.
    const { data: topStockProducts } = await this.supabaseService
      .getAdminClient()
      .from('products')
      .select(
        '*, category:categories!products_category_id_fkey(*), all_categories:product_categories(category:categories!product_categories_category_id_fkey(*)), brand:brands(*), uom:uom(*), uom_conversions:product_uom_conversions(*, uom:uom(*)), stock:stock_batches(quantity_remaining, variant_id), variants:product_variants(*)',
      )
      .neq('id', currentProduct.id)
      .eq('is_hidden', false)
      .limit(limit * 2); // Fetch more to filter out usedIds and sort

    if (topStockProducts) {
      const mapped = topStockProducts
        .map((p) => this.mapProduct(p))
        .filter((p) => !usedIds.has(p.id))
        .sort((a, b) => (b.stock_level || 0) - (a.stock_level || 0));

      mapped.slice(0, limit - recommendations.length).forEach((p) => {
        recommendations.push(p);
        usedIds.add(p.id);
      });
    }

    return recommendations.slice(0, limit);
  }

  async create(
    createProductDto: CreateProductDto & { store_id?: string },
    storeId?: string,
  ) {
    const productData: any = { ...createProductDto };
    if (storeId) productData.store_id = storeId;

    if (productData.category_id === '') productData.category_id = null;
    if (productData.brand_id === '') productData.brand_id = null;
    if (productData.uom_id === '') productData.uom_id = null;

    const { variants, category_ids, ...productDtoWithoutVariants } = productData;

    // Resolve category_ids: prefer category_ids array, fall back to single category_id
    const resolvedCategoryIds: string[] = category_ids?.length
      ? category_ids
      : productDtoWithoutVariants.category_id
        ? [productDtoWithoutVariants.category_id]
        : [];

    // Set primary category_id to first in list for backward compat
    productDtoWithoutVariants.category_id = resolvedCategoryIds[0] ?? null;

    // Check for duplicate SKU
    const skuQuery = this.supabaseService
      .getAdminClient()
      .from('products')
      .select('id')
      .eq('sku', productDtoWithoutVariants.sku);
    if (storeId) skuQuery.eq('store_id', storeId);
    const { data: existingProduct } = await skuQuery.maybeSingle();

    if (existingProduct) {
      throw new BadRequestException(
        `Product with SKU "${productDtoWithoutVariants.sku}" already exists.`,
      );
    }

    const { data: product, error: productError } = await this.supabaseService
      .getAdminClient()
      .from('products')
      .insert(productDtoWithoutVariants)
      .select(
        '*, category:categories!products_category_id_fkey(*), all_categories:product_categories(category:categories!product_categories_category_id_fkey(*)), brand:brands(*), uom:uom(*), uom_conversions:product_uom_conversions(*, uom:uom(*)), stock:stock_batches(quantity_remaining, variant_id), variants:product_variants(*)',
      )
      .single();

    if (productError) throw productError;

    // Sync categories into junction table
    await this.syncProductCategories(product.id, resolvedCategoryIds);

    if (variants && variants.length > 0) {
      const variantsWithProductId = variants.map((v: any) => ({
        ...v,
        product_id: product.id,
        ...(storeId ? { store_id: storeId } : {}),
      }));
      const { error: variantsError } = await this.supabaseService
        .getAdminClient()
        .from('product_variants')
        .insert(variantsWithProductId);
      if (variantsError) {
        await this.supabaseService
          .getAdminClient()
          .from('products')
          .delete()
          .eq('id', product.id);
        throw variantsError;
      }
      const result = await this.findOne(product.id);
      return result;
    }

    const finalProduct = this.mapProduct(product);
    const recommendations = await this.getRecommendations(finalProduct);
    return { ...finalProduct, recommendations };
  }

  async findAll(params?: {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    brandId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    inStock?: boolean;
    includeHidden?: boolean;
  }) {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 30;
    const offset = (page - 1) * limit;
    const search = params?.search?.trim();
    const categoryId = params?.categoryId;
    const brandId = params?.brandId;
    const sortOrder = params?.sortOrder ?? 'asc';
    const allowedSortFields = ['name', 'price', 'created_at'];
    const sortBy = allowedSortFields.includes(params?.sortBy ?? '') ? params!.sortBy! : 'name';
    const inStock = params?.inStock ?? false;
    const includeHidden = params?.includeHidden ?? false;

    // Pre-fetch product IDs for category filter via junction table
    let categoryProductIds: string[] | null = null;
    if (categoryId && categoryId !== 'all' && categoryId !== 'uncategorized' && categoryId !== 'package') {
      const { data: catLinks } = await this.supabaseService
        .getAdminClient()
        .from('product_categories')
        .select('product_id')
        .eq('category_id', categoryId);
      categoryProductIds = catLinks?.map((l) => l.product_id) ?? [];
    }

    // Pre-fetch product IDs that have stock when inStock filter is active
    let inStockProductIds: string[] | null = null;
    if (inStock) {
      const { data: stockData } = await this.supabaseService
        .getAdminClient()
        .from('stock_batches')
        .select('product_id')
        .gt('quantity_remaining', 0);
      inStockProductIds = [...new Set((stockData ?? []).map((s: any) => s.product_id).filter(Boolean))];
    }

    const finalProducts: any[] = [];

    // When filtering by 'package' category, return only packages
    if (categoryId === 'package') {
      let pkgQuery = this.supabaseService
        .getAdminClient()
        .from('product_packages')
        .select(
          '*, items:product_package_items(*, product:products(*), variant:product_variants(*))',
          { count: 'exact' },
        )
        .order('name', { ascending: sortOrder === 'asc' });

      if (search) {
        pkgQuery = this.applySearchFilters(pkgQuery, search, false);
      }

      const {
        data: packages,
        error: pkgError,
        count: pkgCount,
      } = await pkgQuery.range(offset, offset + limit - 1);

      if (pkgError) throw pkgError;

      const packagesWithStock = await this.attachPackageStockLevel(
        packages || [],
      );
      finalProducts.push(
        ...packagesWithStock.map((pkg) => ({
          ...pkg,
          is_package: true,
          category: { id: 'package', name: 'Package' },
        })),
      );

      return {
        data: finalProducts,
        total: pkgCount || 0,
        page,
        limit,
        hasMore: offset + finalProducts.length < (pkgCount || 0),
      };
    }

    // 1. Fetch Product Count
    let productCountQuery = this.supabaseService
      .getAdminClient()
      .from('products')
      .select('*', { count: 'exact', head: true });

    if (!includeHidden) {
      productCountQuery = productCountQuery.eq('is_hidden', false);
    }
    if (search) {
      productCountQuery = this.applySearchFilters(productCountQuery, search);
    }
    if (brandId && brandId !== 'all') {
      productCountQuery = productCountQuery.eq('brand_id', brandId);
    }
    if (categoryId === 'uncategorized') {
      productCountQuery = productCountQuery.is('category_id', null);
    } else if (categoryProductIds !== null) {
      if (categoryProductIds.length === 0) {
        productCountQuery = productCountQuery.eq('id', '00000000-0000-0000-0000-000000000000');
      } else {
        productCountQuery = productCountQuery.in('id', categoryProductIds);
      }
    }
    if (inStockProductIds !== null) {
      if (inStockProductIds.length === 0) {
        productCountQuery = productCountQuery.eq('id', '00000000-0000-0000-0000-000000000000');
      } else {
        productCountQuery = productCountQuery.in('id', inStockProductIds);
      }
    }

    // 2. Fetch Package Count — skip when filtering by brand or category (packages have neither)
    const skipPackages =
      (brandId && brandId !== 'all') ||
      (categoryId && categoryId !== 'all' && categoryId !== 'uncategorized');

    let pkgCount: number | null = 0;
    let productCount: number | null = 0;

    if (skipPackages) {
      const { count } = await productCountQuery;
      productCount = count;
    } else {
      let packageCountQuery = this.supabaseService
        .getAdminClient()
        .from('product_packages')
        .select('*', { count: 'exact', head: true });

      if (search) {
        packageCountQuery = this.applySearchFilters(packageCountQuery, search, false);
      }

      const [{ count: pCount }, { count: pkCount }] = await Promise.all([
        productCountQuery,
        packageCountQuery,
      ]);
      productCount = pCount;
      pkgCount = pkCount;
    }

    const total = (productCount || 0) + (pkgCount || 0);

    // 3. Determine how many products to fetch for this page
    const productsToFetchStart = Math.max(
      0,
      Math.min(productCount || 0, offset),
    );
    const productsToFetchEnd = Math.max(
      0,
      Math.min(productCount || 0, offset + limit),
    );
    const numProductsToFetch = productsToFetchEnd - productsToFetchStart;

    if (numProductsToFetch > 0) {
      let productDataQuery = this.supabaseService
        .getAdminClient()
        .from('products')
        .select(
          '*, category:categories!products_category_id_fkey(*), all_categories:product_categories(category:categories!product_categories_category_id_fkey(*)), brand:brands(*), uom:uom(*), uom_conversions:product_uom_conversions(*, uom:uom(*)), stock:stock_batches(quantity_remaining, variant_id), variants:product_variants(*)',
        );

      if (!includeHidden) {
        productDataQuery = productDataQuery.eq('is_hidden', false);
      }
      if (search) {
        productDataQuery = this.applySearchFilters(productDataQuery, search);
      }
      if (brandId && brandId !== 'all') {
        productDataQuery = productDataQuery.eq('brand_id', brandId);
      }
      if (categoryId === 'uncategorized') {
        productDataQuery = productDataQuery.is('category_id', null);
      } else if (categoryProductIds !== null) {
        if (categoryProductIds.length === 0) {
          productDataQuery = productDataQuery.eq('id', '00000000-0000-0000-0000-000000000000');
        } else {
          productDataQuery = productDataQuery.in('id', categoryProductIds);
        }
      }
      if (inStockProductIds !== null) {
        if (inStockProductIds.length === 0) {
          productDataQuery = productDataQuery.eq('id', '00000000-0000-0000-0000-000000000000');
        } else {
          productDataQuery = productDataQuery.in('id', inStockProductIds);
        }
      }

      const { data: products, error: pError } = await productDataQuery
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range(productsToFetchStart, productsToFetchEnd - 1);

      if (pError) throw pError;
      finalProducts.push(...(products || []).map((p) => this.mapProduct(p)));
    }

    // 4. Fill remaining slots in the page with packages (skip when brand/category filter active)
    const packagesNeeded = skipPackages ? 0 : limit - finalProducts.length;
    if (packagesNeeded > 0) {
      const packageOffset = Math.max(0, offset - (productCount || 0));
      let packageQuery = this.supabaseService
        .getAdminClient()
        .from('product_packages')
        .select(
          '*, items:product_package_items(*, product:products(*), variant:product_variants(*))',
        )
        .order('name', { ascending: sortOrder === 'asc' });

      if (search) {
        packageQuery = this.applySearchFilters(packageQuery, search, false);
      }

      const { data: pkgData, error: pkgError } = await packageQuery.range(
        packageOffset,
        packageOffset + packagesNeeded - 1,
      );

      if (pkgError) throw pkgError;
      const pkgDataWithStock = await this.attachPackageStockLevel(
        pkgData || [],
      );
      finalProducts.push(
        ...pkgDataWithStock.map((pkg) => ({
          ...pkg,
          is_package: true,
          category: { id: 'package', name: 'Package' },
        })),
      );
    }

    return {
      data: finalProducts,
      total,
      page,
      limit,
      hasMore: offset + finalProducts.length < total,
    };
  }

  async findByCategory(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const result = await this.findAll(params);
    const { data: categories } = await this.supabaseService
      .getAdminClient()
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    // Group current page of products by category
    const grouped: Array<{
      category: { id: string; name: string };
      products: any[];
    }> = [];

    // Filter out packages first to avoid them being labeled as 'uncategorized'
    const packages = result.data.filter(
      (p) => p.is_package || p.category_id === 'package',
    );
    const nonPackageProducts = result.data.filter((p) => !p.is_package);

    const uncategorized = nonPackageProducts.filter(
      (p) => !p.categories || p.categories.length === 0,
    );
    if (uncategorized.length > 0)
      grouped.push({
        category: { id: 'uncategorized', name: 'Uncategorized' },
        products: uncategorized,
      });

    for (const cat of categories || []) {
      const catProducts = nonPackageProducts.filter((p) =>
        p.categories?.some((c: any) => c.id === cat.id),
      );
      if (catProducts.length > 0)
        grouped.push({ category: cat, products: catProducts });
    }

    if (packages.length > 0) {
      grouped.push({
        category: { id: 'package', name: 'Package' },
        products: packages,
      });
    }

    return { ...result, grouped };
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('products')
      .select(
        '*, category:categories!products_category_id_fkey(*), all_categories:product_categories(category:categories!product_categories_category_id_fkey(*)), brand:brands(*), uom:uom(*), uom_conversions:product_uom_conversions(*, uom:uom(*)), stock:stock_batches(quantity_remaining, variant_id), variants:product_variants(*)',
      )
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Product with ID ${id} not found`);
    const product = this.mapProduct(data);
    const recommendations = await this.getRecommendations(product);
    return { ...product, recommendations };
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    storeId?: string,
  ) {
    // First verify the product exists (scoped to store if provided)
    let findQuery = this.supabaseService
      .getAdminClient()
      .from('products')
      .select('id')
      .eq('id', id);
    if (storeId) findQuery = findQuery.eq('store_id', storeId);

    const { data: existing, error: findError } = await findQuery.maybeSingle();

    if (findError || !existing) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    const updateData: any = {
      ...updateProductDto,
      updated_at: new Date().toISOString(),
    };

    if (updateData.category_id === '') updateData.category_id = null;
    if (updateData.brand_id === '') updateData.brand_id = null;
    if (updateData.uom_id === '') updateData.uom_id = null;

    const { variants, category_ids, ...updateDtoWithoutVariants } = updateData;

    // Resolve category_ids and sync junction table
    let resolvedCategoryIds: string[] | null = null;
    if (category_ids !== undefined) {
      resolvedCategoryIds = Array.isArray(category_ids) ? category_ids : [];
      updateDtoWithoutVariants.category_id = resolvedCategoryIds[0] ?? null;
    } else if (updateDtoWithoutVariants.category_id !== undefined) {
      resolvedCategoryIds = updateDtoWithoutVariants.category_id
        ? [updateDtoWithoutVariants.category_id]
        : [];
    }

    let updateQuery = this.supabaseService
      .getAdminClient()
      .from('products')
      .update(updateDtoWithoutVariants)
      .eq('id', id);
    if (storeId) updateQuery = updateQuery.eq('store_id', storeId);

    const { data: product, error: productError } = await updateQuery
      .select(
        '*, category:categories!products_category_id_fkey(*), all_categories:product_categories(category:categories!product_categories_category_id_fkey(*)), brand:brands(*), uom:uom(*), stock:stock_batches(quantity_remaining), variants:product_variants(*)',
      )
      .single();

    if (productError) {
      throw new InternalServerErrorException(
        `Failed to update product: ${productError.message}`,
      );
    }

    // Sync categories into junction table if category_ids were provided
    if (resolvedCategoryIds !== null) {
      await this.syncProductCategories(id, resolvedCategoryIds);
    }

    if (variants) {
      await this.supabaseService
        .getAdminClient()
        .from('product_variants')
        .delete()
        .eq('product_id', id);
      if (variants.length > 0) {
        const variantsWithProductId = variants.map((v: any) => ({
          ...v,
          product_id: id,
        }));
        const { error: variantsError } = await this.supabaseService
          .getAdminClient()
          .from('product_variants')
          .insert(variantsWithProductId);
        if (variantsError) throw variantsError;
      }
    }

    return this.findOne(id);
  }

  async batchUpdateBrand(dto: BatchUpdateBrandDto) {
    if (!dto.productIds || dto.productIds.length === 0) {
      throw new BadRequestException('productIds must not be empty');
    }

    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('products')
      .update({
        brand_id: dto.brandId ?? null,
        updated_at: new Date().toISOString(),
      })
      .in('id', dto.productIds)
      .select('id');

    if (error) {
      throw new InternalServerErrorException(
        `Failed to batch update brand: ${error.message}`,
      );
    }

    return {
      message: 'Brand updated successfully',
      updatedCount: data?.length ?? 0,
    };
  }

  async batchUpdateCategory(dto: BatchUpdateCategoryDto) {
    if (!dto.productIds || dto.productIds.length === 0) {
      throw new BadRequestException('productIds must not be empty');
    }

    const categoryIds = dto.categoryIds ?? [];
    const primaryCategoryId = categoryIds[0] ?? null;

    // Update primary category_id on products for backward compat
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('products')
      .update({
        category_id: primaryCategoryId,
        updated_at: new Date().toISOString(),
      })
      .in('id', dto.productIds)
      .select('id');

    if (error) {
      throw new InternalServerErrorException(
        `Failed to batch update category: ${error.message}`,
      );
    }

    // Sync junction table for each product
    await Promise.all(
      dto.productIds.map((productId) =>
        this.syncProductCategories(productId, categoryIds),
      ),
    );

    return {
      message: 'Category updated successfully',
      updatedCount: data?.length ?? 0,
    };
  }

  async remove(id: string) {
    const { error } = await this.supabaseService
      .getAdminClient()
      .from('products')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { message: 'Product deleted successfully' };
  }

  async getProductCount(storeId?: string) {
    let query = this.supabaseService
      .getAdminClient()
      .from('products')
      .select('*', { count: 'exact', head: true });

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    const { count, error } = await query;
    if (error) throw error;
    return { count };
  }
}

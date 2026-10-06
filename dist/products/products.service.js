"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../supabase/supabase.service");
let ProductsService = class ProductsService {
    constructor(supabaseService) {
        this.supabaseService = supabaseService;
    }
    isLikelyAcronym(token) {
        return token.length >= 2 && token.length <= 5 && /^[a-zA-Z]+$/.test(token);
    }
    buildAcronymRegex(token) {
        const letters = token.toLowerCase().split('');
        return letters
            .map((letter, i) => {
            const part = `\\m${letter}[^ -]*`;
            return i < letters.length - 1 ? part + '[ -]+' : part;
        })
            .join('');
    }
    applySearchFilters(query, search, includeDescription = true) {
        const tokens = search.trim().split(/\s+/).filter(Boolean);
        for (const token of tokens) {
            const baseCondition = includeDescription
                ? `name.ilike.%${token}%,sku.ilike.%${token}%,description.ilike.%${token}%`
                : `name.ilike.%${token}%,sku.ilike.%${token}%`;
            if (this.isLikelyAcronym(token)) {
                const acronymRegex = this.buildAcronymRegex(token);
                query = query.or(`${baseCondition},name.imatch.${acronymRegex}`);
            }
            else {
                query = query.or(baseCondition);
            }
        }
        return query;
    }
    mapProduct(product) {
        if (!product)
            return null;
        const stockBatches = product.stock || [];
        const totalStock = stockBatches.reduce((sum, batch) => sum + (batch.quantity_remaining || 0), 0);
        const variantsWithStock = product.variants?.map((variant) => ({
            ...variant,
            stock_level: stockBatches
                .filter((batch) => batch.variant_id === variant.id)
                .reduce((sum, batch) => sum + (batch.quantity_remaining || 0), 0),
        }));
        const categories = (product.all_categories || [])
            .map((pc) => pc.category)
            .filter(Boolean);
        const uomConversions = product.uom_conversions || [];
        const stockByUom = uomConversions.map((conv) => ({
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
            stock_level: totalStock,
            stock_by_uom: stockByUom,
            variants: variantsWithStock,
            stock: undefined,
        };
    }
    async syncProductCategories(productId, categoryIds) {
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
    async attachPackageStockLevel(packages) {
        const productIds = [
            ...new Set(packages.flatMap((pkg) => (pkg.items ?? []).map((i) => i.product_id).filter(Boolean))),
        ];
        if (productIds.length === 0)
            return packages.map((p) => ({ ...p, stock_level: 0 }));
        const { data: batches } = await this.supabaseService
            .getAdminClient()
            .from('stock_batches')
            .select('product_id, variant_id, quantity_remaining')
            .in('product_id', productIds)
            .gt('quantity_remaining', 0);
        const stockMap = new Map();
        for (const b of batches ?? []) {
            const key = `${b.product_id}::${b.variant_id ?? 'base'}`;
            stockMap.set(key, (stockMap.get(key) ?? 0) + (b.quantity_remaining || 0));
        }
        return packages.map((pkg) => {
            if (!pkg.items || pkg.items.length === 0)
                return { ...pkg, stock_level: 0, cost: 0 };
            let min = Infinity;
            let totalCost = 0;
            for (const item of pkg.items) {
                const available = stockMap.get(`${item.product_id}::${item.variant_id ?? 'base'}`) ?? 0;
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
    async getRecommendations(currentProduct, limit = 4) {
        const recommendations = [];
        const usedIds = new Set([currentProduct.id]);
        if (currentProduct.category_id) {
            const { data: catProducts } = await this.supabaseService
                .getAdminClient()
                .from('products')
                .select('*, category:categories!products_category_id_fkey(*), all_categories:product_categories(category:categories!product_categories_category_id_fkey(*)), brand:brands(*), uom:uom(*), uom_conversions:product_uom_conversions(*, uom:uom(*)), stock:stock_batches(quantity_remaining, variant_id), variants:product_variants(*)')
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
        const { data: brandProducts } = await this.supabaseService
            .getAdminClient()
            .from('products')
            .select('*, category:categories!products_category_id_fkey(*), all_categories:product_categories(category:categories!product_categories_category_id_fkey(*)), brand:brands(*), uom:uom(*), uom_conversions:product_uom_conversions(*, uom:uom(*)), stock:stock_batches(quantity_remaining, variant_id), variants:product_variants(*)')
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
        const { data: topStockProducts } = await this.supabaseService
            .getAdminClient()
            .from('products')
            .select('*, category:categories!products_category_id_fkey(*), all_categories:product_categories(category:categories!product_categories_category_id_fkey(*)), brand:brands(*), uom:uom(*), uom_conversions:product_uom_conversions(*, uom:uom(*)), stock:stock_batches(quantity_remaining, variant_id), variants:product_variants(*)')
            .neq('id', currentProduct.id)
            .eq('is_hidden', false)
            .limit(limit * 2);
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
    async create(createProductDto, storeId) {
        const productData = { ...createProductDto };
        if (storeId)
            productData.store_id = storeId;
        if (productData.category_id === '')
            productData.category_id = null;
        if (productData.brand_id === '')
            productData.brand_id = null;
        if (productData.uom_id === '')
            productData.uom_id = null;
        const { variants, category_ids, ...productDtoWithoutVariants } = productData;
        const resolvedCategoryIds = category_ids?.length
            ? category_ids
            : productDtoWithoutVariants.category_id
                ? [productDtoWithoutVariants.category_id]
                : [];
        productDtoWithoutVariants.category_id = resolvedCategoryIds[0] ?? null;
        const skuQuery = this.supabaseService
            .getAdminClient()
            .from('products')
            .select('id')
            .eq('sku', productDtoWithoutVariants.sku);
        if (storeId)
            skuQuery.eq('store_id', storeId);
        const { data: existingProduct } = await skuQuery.maybeSingle();
        if (existingProduct) {
            throw new common_1.BadRequestException(`Product with SKU "${productDtoWithoutVariants.sku}" already exists.`);
        }
        const { data: product, error: productError } = await this.supabaseService
            .getAdminClient()
            .from('products')
            .insert(productDtoWithoutVariants)
            .select('*, category:categories!products_category_id_fkey(*), all_categories:product_categories(category:categories!product_categories_category_id_fkey(*)), brand:brands(*), uom:uom(*), uom_conversions:product_uom_conversions(*, uom:uom(*)), stock:stock_batches(quantity_remaining, variant_id), variants:product_variants(*)')
            .single();
        if (productError)
            throw productError;
        await this.syncProductCategories(product.id, resolvedCategoryIds);
        if (variants && variants.length > 0) {
            const variantsWithProductId = variants.map((v) => ({
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
    async findAll(params) {
        const page = params?.page ?? 1;
        const limit = params?.limit ?? 30;
        const offset = (page - 1) * limit;
        const search = params?.search?.trim();
        const categoryId = params?.categoryId;
        const brandId = params?.brandId;
        const sortOrder = params?.sortOrder ?? 'asc';
        const allowedSortFields = ['name', 'price', 'created_at'];
        const sortBy = allowedSortFields.includes(params?.sortBy ?? '') ? params.sortBy : 'name';
        const inStock = params?.inStock ?? false;
        const includeHidden = params?.includeHidden ?? false;
        let categoryProductIds = null;
        if (categoryId && categoryId !== 'all' && categoryId !== 'uncategorized' && categoryId !== 'package') {
            const { data: catLinks } = await this.supabaseService
                .getAdminClient()
                .from('product_categories')
                .select('product_id')
                .eq('category_id', categoryId);
            categoryProductIds = catLinks?.map((l) => l.product_id) ?? [];
        }
        let inStockProductIds = null;
        if (inStock) {
            const { data: stockData } = await this.supabaseService
                .getAdminClient()
                .from('stock_batches')
                .select('product_id')
                .gt('quantity_remaining', 0);
            inStockProductIds = [...new Set((stockData ?? []).map((s) => s.product_id).filter(Boolean))];
        }
        const finalProducts = [];
        if (categoryId === 'package') {
            let pkgQuery = this.supabaseService
                .getAdminClient()
                .from('product_packages')
                .select('*, items:product_package_items(*, product:products(*), variant:product_variants(*))', { count: 'exact' })
                .order('name', { ascending: sortOrder === 'asc' });
            if (search) {
                pkgQuery = this.applySearchFilters(pkgQuery, search, false);
            }
            const { data: packages, error: pkgError, count: pkgCount, } = await pkgQuery.range(offset, offset + limit - 1);
            if (pkgError)
                throw pkgError;
            const packagesWithStock = await this.attachPackageStockLevel(packages || []);
            finalProducts.push(...packagesWithStock.map((pkg) => ({
                ...pkg,
                is_package: true,
                category: { id: 'package', name: 'Package' },
            })));
            return {
                data: finalProducts,
                total: pkgCount || 0,
                page,
                limit,
                hasMore: offset + finalProducts.length < (pkgCount || 0),
            };
        }
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
        }
        else if (categoryProductIds !== null) {
            if (categoryProductIds.length === 0) {
                productCountQuery = productCountQuery.eq('id', '00000000-0000-0000-0000-000000000000');
            }
            else {
                productCountQuery = productCountQuery.in('id', categoryProductIds);
            }
        }
        if (inStockProductIds !== null) {
            if (inStockProductIds.length === 0) {
                productCountQuery = productCountQuery.eq('id', '00000000-0000-0000-0000-000000000000');
            }
            else {
                productCountQuery = productCountQuery.in('id', inStockProductIds);
            }
        }
        const skipPackages = (brandId && brandId !== 'all') ||
            (categoryId && categoryId !== 'all' && categoryId !== 'uncategorized');
        let pkgCount = 0;
        let productCount = 0;
        if (skipPackages) {
            const { count } = await productCountQuery;
            productCount = count;
        }
        else {
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
        const productsToFetchStart = Math.max(0, Math.min(productCount || 0, offset));
        const productsToFetchEnd = Math.max(0, Math.min(productCount || 0, offset + limit));
        const numProductsToFetch = productsToFetchEnd - productsToFetchStart;
        if (numProductsToFetch > 0) {
            let productDataQuery = this.supabaseService
                .getAdminClient()
                .from('products')
                .select('*, category:categories!products_category_id_fkey(*), all_categories:product_categories(category:categories!product_categories_category_id_fkey(*)), brand:brands(*), uom:uom(*), uom_conversions:product_uom_conversions(*, uom:uom(*)), stock:stock_batches(quantity_remaining, variant_id), variants:product_variants(*)');
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
            }
            else if (categoryProductIds !== null) {
                if (categoryProductIds.length === 0) {
                    productDataQuery = productDataQuery.eq('id', '00000000-0000-0000-0000-000000000000');
                }
                else {
                    productDataQuery = productDataQuery.in('id', categoryProductIds);
                }
            }
            if (inStockProductIds !== null) {
                if (inStockProductIds.length === 0) {
                    productDataQuery = productDataQuery.eq('id', '00000000-0000-0000-0000-000000000000');
                }
                else {
                    productDataQuery = productDataQuery.in('id', inStockProductIds);
                }
            }
            const { data: products, error: pError } = await productDataQuery
                .order(sortBy, { ascending: sortOrder === 'asc' })
                .range(productsToFetchStart, productsToFetchEnd - 1);
            if (pError)
                throw pError;
            finalProducts.push(...(products || []).map((p) => this.mapProduct(p)));
        }
        const packagesNeeded = skipPackages ? 0 : limit - finalProducts.length;
        if (packagesNeeded > 0) {
            const packageOffset = Math.max(0, offset - (productCount || 0));
            let packageQuery = this.supabaseService
                .getAdminClient()
                .from('product_packages')
                .select('*, items:product_package_items(*, product:products(*), variant:product_variants(*))')
                .order('name', { ascending: sortOrder === 'asc' });
            if (search) {
                packageQuery = this.applySearchFilters(packageQuery, search, false);
            }
            const { data: pkgData, error: pkgError } = await packageQuery.range(packageOffset, packageOffset + packagesNeeded - 1);
            if (pkgError)
                throw pkgError;
            const pkgDataWithStock = await this.attachPackageStockLevel(pkgData || []);
            finalProducts.push(...pkgDataWithStock.map((pkg) => ({
                ...pkg,
                is_package: true,
                category: { id: 'package', name: 'Package' },
            })));
        }
        return {
            data: finalProducts,
            total,
            page,
            limit,
            hasMore: offset + finalProducts.length < total,
        };
    }
    async findByCategory(params) {
        const result = await this.findAll(params);
        const { data: categories } = await this.supabaseService
            .getAdminClient()
            .from('categories')
            .select('*')
            .order('name', { ascending: true });
        const grouped = [];
        const packages = result.data.filter((p) => p.is_package || p.category_id === 'package');
        const nonPackageProducts = result.data.filter((p) => !p.is_package);
        const uncategorized = nonPackageProducts.filter((p) => !p.categories || p.categories.length === 0);
        if (uncategorized.length > 0)
            grouped.push({
                category: { id: 'uncategorized', name: 'Uncategorized' },
                products: uncategorized,
            });
        for (const cat of categories || []) {
            const catProducts = nonPackageProducts.filter((p) => p.categories?.some((c) => c.id === cat.id));
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
    async findOne(id) {
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .from('products')
            .select('*, category:categories!products_category_id_fkey(*), all_categories:product_categories(category:categories!product_categories_category_id_fkey(*)), brand:brands(*), uom:uom(*), uom_conversions:product_uom_conversions(*, uom:uom(*)), stock:stock_batches(quantity_remaining, variant_id), variants:product_variants(*)')
            .eq('id', id)
            .single();
        if (error)
            throw new common_1.NotFoundException(`Product with ID ${id} not found`);
        const product = this.mapProduct(data);
        const recommendations = await this.getRecommendations(product);
        return { ...product, recommendations };
    }
    async update(id, updateProductDto, storeId) {
        let findQuery = this.supabaseService
            .getAdminClient()
            .from('products')
            .select('id')
            .eq('id', id);
        if (storeId)
            findQuery = findQuery.eq('store_id', storeId);
        const { data: existing, error: findError } = await findQuery.maybeSingle();
        if (findError || !existing) {
            throw new common_1.NotFoundException(`Product with ID ${id} not found`);
        }
        const updateData = {
            ...updateProductDto,
            updated_at: new Date().toISOString(),
        };
        if (updateData.category_id === '')
            updateData.category_id = null;
        if (updateData.brand_id === '')
            updateData.brand_id = null;
        if (updateData.uom_id === '')
            updateData.uom_id = null;
        const { variants, category_ids, ...updateDtoWithoutVariants } = updateData;
        let resolvedCategoryIds = null;
        if (category_ids !== undefined) {
            resolvedCategoryIds = Array.isArray(category_ids) ? category_ids : [];
            updateDtoWithoutVariants.category_id = resolvedCategoryIds[0] ?? null;
        }
        else if (updateDtoWithoutVariants.category_id !== undefined) {
            resolvedCategoryIds = updateDtoWithoutVariants.category_id
                ? [updateDtoWithoutVariants.category_id]
                : [];
        }
        let updateQuery = this.supabaseService
            .getAdminClient()
            .from('products')
            .update(updateDtoWithoutVariants)
            .eq('id', id);
        if (storeId)
            updateQuery = updateQuery.eq('store_id', storeId);
        const { data: product, error: productError } = await updateQuery
            .select('*, category:categories!products_category_id_fkey(*), all_categories:product_categories(category:categories!product_categories_category_id_fkey(*)), brand:brands(*), uom:uom(*), stock:stock_batches(quantity_remaining), variants:product_variants(*)')
            .single();
        if (productError) {
            throw new common_1.InternalServerErrorException(`Failed to update product: ${productError.message}`);
        }
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
                const variantsWithProductId = variants.map((v) => ({
                    ...v,
                    product_id: id,
                }));
                const { error: variantsError } = await this.supabaseService
                    .getAdminClient()
                    .from('product_variants')
                    .insert(variantsWithProductId);
                if (variantsError)
                    throw variantsError;
            }
        }
        return this.findOne(id);
    }
    async batchUpdateBrand(dto) {
        if (!dto.productIds || dto.productIds.length === 0) {
            throw new common_1.BadRequestException('productIds must not be empty');
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
            throw new common_1.InternalServerErrorException(`Failed to batch update brand: ${error.message}`);
        }
        return {
            message: 'Brand updated successfully',
            updatedCount: data?.length ?? 0,
        };
    }
    async batchUpdateCategory(dto) {
        if (!dto.productIds || dto.productIds.length === 0) {
            throw new common_1.BadRequestException('productIds must not be empty');
        }
        const categoryIds = dto.categoryIds ?? [];
        const primaryCategoryId = categoryIds[0] ?? null;
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
            throw new common_1.InternalServerErrorException(`Failed to batch update category: ${error.message}`);
        }
        await Promise.all(dto.productIds.map((productId) => this.syncProductCategories(productId, categoryIds)));
        return {
            message: 'Category updated successfully',
            updatedCount: data?.length ?? 0,
        };
    }
    async remove(id) {
        const { error } = await this.supabaseService
            .getAdminClient()
            .from('products')
            .delete()
            .eq('id', id);
        if (error)
            throw error;
        return { message: 'Product deleted successfully' };
    }
    async getProductCount(storeId) {
        let query = this.supabaseService
            .getAdminClient()
            .from('products')
            .select('*', { count: 'exact', head: true });
        if (storeId) {
            query = query.eq('store_id', storeId);
        }
        const { count, error } = await query;
        if (error)
            throw error;
        return { count };
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService])
], ProductsService);
//# sourceMappingURL=products.service.js.map
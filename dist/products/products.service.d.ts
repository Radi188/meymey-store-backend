import { SupabaseService } from '../supabase/supabase.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { BatchUpdateBrandDto, BatchUpdateCategoryDto } from './dto/batch-update-product.dto';
export declare class ProductsService {
    private supabaseService;
    constructor(supabaseService: SupabaseService);
    private isLikelyAcronym;
    private buildAcronymRegex;
    private applySearchFilters;
    private mapProduct;
    private syncProductCategories;
    private attachPackageStockLevel;
    private getRecommendations;
    create(createProductDto: CreateProductDto & {
        store_id?: string;
    }, storeId?: string): Promise<any>;
    findAll(params?: {
        page?: number;
        limit?: number;
        search?: string;
        categoryId?: string;
        brandId?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        inStock?: boolean;
        includeHidden?: boolean;
    }): Promise<{
        data: any[];
        total: number;
        page: number;
        limit: number;
        hasMore: boolean;
    }>;
    findByCategory(params?: {
        page?: number;
        limit?: number;
        search?: string;
    }): Promise<{
        grouped: {
            category: {
                id: string;
                name: string;
            };
            products: any[];
        }[];
        data: any[];
        total: number;
        page: number;
        limit: number;
        hasMore: boolean;
    }>;
    findOne(id: string): Promise<any>;
    update(id: string, updateProductDto: UpdateProductDto, storeId?: string): Promise<any>;
    batchUpdateBrand(dto: BatchUpdateBrandDto): Promise<{
        message: string;
        updatedCount: number;
    }>;
    batchUpdateCategory(dto: BatchUpdateCategoryDto): Promise<{
        message: string;
        updatedCount: number;
    }>;
    remove(id: string): Promise<{
        message: string;
    }>;
    getProductCount(storeId?: string): Promise<{
        count: number | null;
    }>;
}

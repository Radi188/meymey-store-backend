import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { BatchUpdateBrandDto, BatchUpdateCategoryDto } from './dto/batch-update-product.dto';
export declare class ProductsController {
    private readonly productsService;
    constructor(productsService: ProductsService);
    create(createProductDto: CreateProductDto, req: any): Promise<any>;
    findAll(page?: string, limit?: string, search?: string, categoryId?: string, brandId?: string, sortBy?: string, sortOrder?: string, inStock?: string, includeHidden?: string): Promise<{
        data: any[];
        total: number;
        page: number;
        limit: number;
        hasMore: boolean;
    }>;
    findByCategory(page?: string, limit?: string, search?: string): Promise<{
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
    getProductCount(req: any): Promise<{
        count: number | null;
    }>;
    findOne(id: string): Promise<any>;
    batchUpdateBrand(dto: BatchUpdateBrandDto): Promise<{
        message: string;
        updatedCount: number;
    }>;
    batchUpdateCategory(dto: BatchUpdateCategoryDto): Promise<{
        message: string;
        updatedCount: number;
    }>;
    update(id: string, updateProductDto: UpdateProductDto, req: any): Promise<any>;
    remove(id: string): Promise<{
        message: string;
    }>;
}

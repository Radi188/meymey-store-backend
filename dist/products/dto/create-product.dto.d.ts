export declare class CreateProductDto {
    name: string;
    sku: string;
    description?: string;
    image_url?: string;
    image_urls?: string[];
    category_id?: string;
    category_ids?: string[];
    brand_id?: string;
    uom_id?: string;
    price?: number;
    cost?: number;
    reorder_level?: number;
    how_to_use?: string;
    ingredients?: string;
    is_hidden?: boolean;
}

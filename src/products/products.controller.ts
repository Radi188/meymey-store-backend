import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  BatchUpdateBrandDto,
  BatchUpdateCategoryDto,
} from './dto/batch-update-product.dto';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(SupabaseAuthGuard)
  @Post()
  create(@Body() createProductDto: CreateProductDto, @Request() req: any) {
    const storeId = req.user?.store?.id;
    return this.productsService.create(createProductDto, storeId);
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('inStock') inStock?: string,
    // Hidden products are left out unless asked for (product management screens).
    @Query('includeHidden') includeHidden?: string,
  ) {
    return this.productsService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      categoryId,
      brandId,
      sortBy,
      sortOrder: sortOrder === 'desc' ? 'desc' : 'asc',
      inStock: inStock === 'true',
      includeHidden: includeHidden === 'true',
    });
  }

  @Get('by-category')
  findByCategory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.productsService.findByCategory({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
    });
  }

  @UseGuards(SupabaseAuthGuard)
  @Get('count')
  getProductCount(@Request() req: any) {
    const storeId = req.user?.store?.id;
    return this.productsService.getProductCount(storeId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @UseGuards(SupabaseAuthGuard)
  @Patch('batch-update/brand')
  batchUpdateBrand(@Body() dto: BatchUpdateBrandDto) {
    return this.productsService.batchUpdateBrand(dto);
  }

  @UseGuards(SupabaseAuthGuard)
  @Patch('batch-update/category')
  batchUpdateCategory(@Body() dto: BatchUpdateCategoryDto) {
    return this.productsService.batchUpdateCategory(dto);
  }

  @UseGuards(SupabaseAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @Request() req: any,
  ) {
    const storeId = req.user?.store?.id;
    return this.productsService.update(id, updateProductDto, storeId);
  }

  @UseGuards(SupabaseAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}

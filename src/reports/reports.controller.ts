import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';

@Controller('reports')
@UseGuards(SupabaseAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('profit')
  getProfitReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getProfitReport(startDate, endDate);
  }

  @Get('summary')
  getSummaryReport(@Request() req: any) {
    const storeId = req.user?.store?.id;
    return this.reportsService.getSummaryReport(storeId);
  }

  @Get('purchase')
  getPurchaseReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getPurchaseReport(startDate, endDate);
  }

  @Get('inventory')
  getInventoryReport() {
    return this.reportsService.getInventoryReport();
  }

  @Get('sales')
  getSalesReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getSalesReport(startDate, endDate);
  }

  @Get('sales-by-customer')
  getSalesByCustomerReport() {
    return this.reportsService.getSalesByCustomerReport();
  }

  @Get('sales-by-payment-method')
  getSalesByPaymentMethodReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getSalesByPaymentMethodReport(startDate, endDate);
  }

  @Get('sales-by-product')
  getSalesByProductReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getSalesByProductReport(startDate, endDate);
  }

  @Get('revenue-by-day')
  getDailyRevenueReport(@Request() req: any, @Query('days') days?: string) {
    const storeId = req.user?.store?.id;
    return this.reportsService.getDailyRevenueReport(
      storeId,
      days ? parseInt(days, 10) : 30,
    );
  }

  @Get('sales-by-category')
  getSalesByCategoryReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getSalesByCategoryReport(startDate, endDate);
  }

  @Get('product-suppliers')
  getProductSuppliersReport() {
    return this.reportsService.getProductSuppliersReport();
  }

  @Get('supplier-stock')
  getSupplierStockReport() {
    return this.reportsService.getSupplierStockReport();
  }

  @Get('yearly-profit-loss')
  getYearlyProfitLoss(
    @Request() req: any,
    @Query('year') year?: string,
  ) {
    const storeId = req.user?.store?.id;
    const now = new Date();
    return this.reportsService.getYearlyProfitLoss(
      storeId,
      Number(year) || now.getFullYear(),
    );
  }

  @Get('profit-loss')
  getMonthlyProfitLoss(
    @Request() req: any,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const storeId = req.user?.store?.id;
    const now = new Date();
    return this.reportsService.getMonthlyProfitLoss(
      storeId,
      Number(year) || now.getFullYear(),
      Number(month) || now.getMonth() + 1,
    );
  }
}

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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const reports_service_1 = require("./reports.service");
const supabase_auth_guard_1 = require("../auth/supabase-auth.guard");
let ReportsController = class ReportsController {
    constructor(reportsService) {
        this.reportsService = reportsService;
    }
    getProfitReport(startDate, endDate) {
        return this.reportsService.getProfitReport(startDate, endDate);
    }
    getSummaryReport(req) {
        const storeId = req.user?.store?.id;
        return this.reportsService.getSummaryReport(storeId);
    }
    getPurchaseReport(startDate, endDate) {
        return this.reportsService.getPurchaseReport(startDate, endDate);
    }
    getInventoryReport() {
        return this.reportsService.getInventoryReport();
    }
    getSalesReport(startDate, endDate) {
        return this.reportsService.getSalesReport(startDate, endDate);
    }
    getSalesByCustomerReport() {
        return this.reportsService.getSalesByCustomerReport();
    }
    getSalesByPaymentMethodReport(startDate, endDate) {
        return this.reportsService.getSalesByPaymentMethodReport(startDate, endDate);
    }
    getSalesByProductReport(startDate, endDate) {
        return this.reportsService.getSalesByProductReport(startDate, endDate);
    }
    getDailyRevenueReport(req, days) {
        const storeId = req.user?.store?.id;
        return this.reportsService.getDailyRevenueReport(storeId, days ? parseInt(days, 10) : 30);
    }
    getSalesByCategoryReport(startDate, endDate) {
        return this.reportsService.getSalesByCategoryReport(startDate, endDate);
    }
    getProductSuppliersReport() {
        return this.reportsService.getProductSuppliersReport();
    }
    getSupplierStockReport() {
        return this.reportsService.getSupplierStockReport();
    }
    getYearlyProfitLoss(req, year) {
        const storeId = req.user?.store?.id;
        const now = new Date();
        return this.reportsService.getYearlyProfitLoss(storeId, Number(year) || now.getFullYear());
    }
    getMonthlyProfitLoss(req, year, month) {
        const storeId = req.user?.store?.id;
        const now = new Date();
        return this.reportsService.getMonthlyProfitLoss(storeId, Number(year) || now.getFullYear(), Number(month) || now.getMonth() + 1);
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Get)('profit'),
    __param(0, (0, common_1.Query)('startDate')),
    __param(1, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getProfitReport", null);
__decorate([
    (0, common_1.Get)('summary'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getSummaryReport", null);
__decorate([
    (0, common_1.Get)('purchase'),
    __param(0, (0, common_1.Query)('startDate')),
    __param(1, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getPurchaseReport", null);
__decorate([
    (0, common_1.Get)('inventory'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getInventoryReport", null);
__decorate([
    (0, common_1.Get)('sales'),
    __param(0, (0, common_1.Query)('startDate')),
    __param(1, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getSalesReport", null);
__decorate([
    (0, common_1.Get)('sales-by-customer'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getSalesByCustomerReport", null);
__decorate([
    (0, common_1.Get)('sales-by-payment-method'),
    __param(0, (0, common_1.Query)('startDate')),
    __param(1, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getSalesByPaymentMethodReport", null);
__decorate([
    (0, common_1.Get)('sales-by-product'),
    __param(0, (0, common_1.Query)('startDate')),
    __param(1, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getSalesByProductReport", null);
__decorate([
    (0, common_1.Get)('revenue-by-day'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getDailyRevenueReport", null);
__decorate([
    (0, common_1.Get)('sales-by-category'),
    __param(0, (0, common_1.Query)('startDate')),
    __param(1, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getSalesByCategoryReport", null);
__decorate([
    (0, common_1.Get)('product-suppliers'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getProductSuppliersReport", null);
__decorate([
    (0, common_1.Get)('supplier-stock'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getSupplierStockReport", null);
__decorate([
    (0, common_1.Get)('yearly-profit-loss'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('year')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getYearlyProfitLoss", null);
__decorate([
    (0, common_1.Get)('profit-loss'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('year')),
    __param(2, (0, common_1.Query)('month')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getMonthlyProfitLoss", null);
exports.ReportsController = ReportsController = __decorate([
    (0, common_1.Controller)('reports'),
    (0, common_1.UseGuards)(supabase_auth_guard_1.SupabaseAuthGuard),
    __metadata("design:paramtypes", [reports_service_1.ReportsService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map
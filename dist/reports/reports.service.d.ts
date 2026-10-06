import { SupabaseService } from '../supabase/supabase.service';
export declare class ReportsService {
    private supabaseService;
    constructor(supabaseService: SupabaseService);
    getProfitReport(startDate?: string, endDate?: string): Promise<{
        summary: {
            totalRevenue: number;
            totalCOGS: number;
            totalExpenses: number;
            grossProfit: number;
            netProfit: number;
            profitMargin: number;
            orderCount: number;
        };
        orders: {
            id: any;
            order_date: any;
            revenue: any;
            cogs: number;
            profit: number;
        }[];
    }>;
    getSummaryReport(storeId: string): Promise<{
        totalSales: number;
        totalPurchases: number;
        totalInventoryValue: number;
        lowStockCount: number;
        productCount: number;
    }>;
    getPurchaseReport(startDate?: string, endDate?: string): Promise<any[]>;
    getInventoryReport(): Promise<{
        stock_level: any;
        is_low_stock: boolean;
        id: any;
        name: any;
        sku: any;
        reorder_level: any;
        category: {
            name: any;
        }[];
        uom: {
            abbreviation: any;
        }[];
        stock: {
            quantity_remaining: any;
        }[];
    }[]>;
    getSalesReport(startDate?: string, endDate?: string): Promise<{
        id: any;
        order_number: any;
        date: any;
        customer: {
            id: any;
            name: any;
        } | null;
        payment_method: {
            id: any;
            name: any;
            type: any;
        } | null;
        revenue: number;
        cogs: number;
        profit: number;
        profit_margin: number;
        discount: number;
        item_discount: number;
        tax: number;
        total_amount: number;
    }[]>;
    getSalesByCustomerReport(): Promise<{
        name: string;
        total: number;
    }[]>;
    getSalesByPaymentMethodReport(startDate?: string, endDate?: string): Promise<{
        name: string;
        type: string | null;
        total: number;
        orderCount: number;
        id: string;
    }[]>;
    getSalesByProductReport(startDate?: string, endDate?: string): Promise<{
        name: string;
        sku: string;
        quantity: number;
        revenue: number;
        id: string;
    }[]>;
    getDailyRevenueReport(storeId: string, days?: number): Promise<{
        date: string;
        revenue: number;
        profit: number;
    }[]>;
    getSalesByCategoryReport(startDate?: string, endDate?: string): Promise<{
        percentage: number;
        category: string;
        revenue: number;
        quantity: number;
    }[]>;
    getMonthlyProfitLoss(storeId: string, year: number, month: number): Promise<{
        totalIncome: number;
        totalExpenses: number;
        netProfit: number;
        profitMargin: number;
        incomeByCategory: {};
        expenseByCategory: {};
        year?: undefined;
        month?: undefined;
        startDate?: undefined;
        endDate?: undefined;
    } | {
        year: number;
        month: number;
        startDate: string;
        endDate: string;
        totalIncome: number;
        totalExpenses: number;
        netProfit: number;
        profitMargin: number;
        incomeByCategory: Record<string, number>;
        expenseByCategory: Record<string, number>;
    }>;
    getYearlyProfitLoss(storeId: string, year: number): Promise<{
        month: number;
        monthName: string;
        revenue: number;
        cogs: number;
        expenses: number;
        grossProfit: number;
        netProfit: number;
    }[]>;
    getProductSuppliersReport(): Promise<{
        id: string;
        name: string;
        sku: string;
        suppliers: {
            id: string;
            name: string;
        }[];
    }[]>;
    getSupplierStockReport(): Promise<{
        summary: {
            suppliers: number;
            products: number;
            purchases: number;
            qtyPurchased: number;
            qtyRemaining: number;
            purchaseCost: number;
            remainingValue: number;
        };
        suppliers: any[];
        items: {
            transactions: {
                batchId: string;
                batchNumber: string | null;
                date: string | null;
                poId: string | null;
                poNumber: string | null;
                qtyReceived: number;
                qtyRemaining: number;
                unitCost: number;
                totalCost: number;
            }[];
            purchases: number;
            qtyPurchased: number;
            qtyRemaining: number;
            qtyUsed: number;
            qtyAdded: number;
            avgUnitCost: number;
            lastUnitCost: number;
            minUnitCost: number;
            maxUnitCost: number;
            purchaseCost: number;
            remainingValue: number;
            firstPurchaseDate: string | null;
            lastPurchaseDate: string | null;
            key: string;
            product: {
                id: string;
                name: string;
                sku: string | null;
                image_url: string | null;
                price: number | null;
            };
            variant: {
                id: string;
                name: string;
                sku: string | null;
            } | null;
            supplier: {
                id: string | null;
                name: string;
            };
        }[];
    }>;
    private fetchAllStockBatches;
    private round2;
}

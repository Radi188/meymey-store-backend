import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ReportsService {
  constructor(private supabaseService: SupabaseService) {}

  async getProfitReport(startDate?: string, endDate?: string) {
    let ordersQuery = this.supabaseService
      .getAdminClient()
      .from('sales_orders')
      .select(
        `id, total_amount, subtotal, discount, tax, order_date, created_at, items:sales_order_items(id, total, quantity, unit_price, costs:sales_order_item_costs(quantity, unit_cost))`,
      )
      .filter('status', 'ilike', 'completed');

    if (startDate) ordersQuery = ordersQuery.gte('created_at', `${startDate}T00:00:00`);
    if (endDate) ordersQuery = ordersQuery.lte('created_at', `${endDate}T23:59:59`);

    let expensesQuery = this.supabaseService
      .getAdminClient()
      .from('expenses')
      .select('amount');

    if (startDate) expensesQuery = expensesQuery.gte('date', startDate);
    if (endDate) expensesQuery = expensesQuery.lte('date', endDate);

    const [{ data: orders, error }, { data: expenseRows }] = await Promise.all([
      ordersQuery.order('created_at', { ascending: false }),
      expensesQuery,
    ]);
    if (error) throw error;

    let totalRevenue = 0;
    let totalCOGS = 0;
    orders?.forEach((order) => {
      totalRevenue += Number(order.subtotal || 0);
      order.items?.forEach((item: any) => {
        item.costs?.forEach((cost: any) => {
          totalCOGS += Number(cost.quantity) * Number(cost.unit_cost);
        });
      });
    });

    const totalExpenses = expenseRows?.reduce((sum, r) => sum + Number(r.amount || 0), 0) ?? 0;
    const grossProfit = totalRevenue - totalCOGS;
    const netProfit = grossProfit - totalExpenses;
    const profitMargin =
      totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    return {
      summary: {
        totalRevenue,
        totalCOGS,
        totalExpenses,
        grossProfit,
        netProfit,
        profitMargin: Number(profitMargin.toFixed(2)),
        orderCount: orders?.length || 0,
      },
      orders: orders?.map((o) => {
        let orderCOGS = 0;
        o.items?.forEach((item: any) => {
          item.costs?.forEach((cost: any) => {
            orderCOGS += Number(cost.quantity) * Number(cost.unit_cost);
          });
        });
        return {
          id: o.id,
          order_date: o.order_date || o.created_at,
          revenue: o.subtotal,
          cogs: orderCOGS,
          profit: Number(o.subtotal) - orderCOGS,
        };
      }),
    };
  }

  async getSummaryReport(storeId: string) {
    let salesQuery = this.supabaseService
      .getAdminClient()
      .from('sales_orders')
      .select('total_amount', { count: 'exact', head: false })
      .filter('status', 'ilike', 'completed');

    let purchaseQuery = this.supabaseService
      .getAdminClient()
      .from('purchase_orders')
      .select('total_amount', { count: 'exact', head: false })
      // PO statuses are stored lowercase ('received'); match case-insensitively.
      .filter('status', 'ilike', 'received');

    let productQuery = this.supabaseService
      .getAdminClient()
      .from('products')
      .select(
        'id, name, price, cost, reorder_level, stock:stock_batches(quantity_remaining)',
      );

    let productCountQuery = this.supabaseService
      .getAdminClient()
      .from('products')
      .select('*', { count: 'exact', head: true });

    if (storeId) {
      salesQuery = salesQuery.eq('store_id', storeId);
      purchaseQuery = purchaseQuery.eq('store_id', storeId);
      productQuery = productQuery.eq('store_id', storeId);
      productCountQuery = productCountQuery.eq('store_id', storeId);
    }

    const [
      { data: salesData },
      { data: purchaseData },
      { data: productData },
      { count: totalProducts },
    ] = await Promise.all([
      salesQuery,
      purchaseQuery,
      productQuery,
      productCountQuery,
    ]);

    const totalSales =
      salesData?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;

    const totalPurchases =
      purchaseData?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) ||
      0;

    let totalInventoryValue = 0;
    let lowStockCount = 0;
    productData?.forEach((p) => {
      const stock =
        p.stock?.reduce((sum, b) => sum + (b.quantity_remaining || 0), 0) || 0;
      totalInventoryValue += stock * Number(p.price || 0);
      if (stock <= (p.reorder_level || 0)) lowStockCount++;
    });

    return {
      totalSales,
      totalPurchases,
      totalInventoryValue,
      lowStockCount,
      productCount: totalProducts ?? 0,
    };
  }

  async getPurchaseReport(startDate?: string, endDate?: string) {
    let query = this.supabaseService
      .getAdminClient()
      .from('purchase_orders')
      .select('*, supplier:suppliers(name)');
    if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
    if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);
    const { data, error } = await query.order('created_at', {
      ascending: false,
    });
    if (error) throw error;
    return data;
  }

  async getInventoryReport() {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('products')
      .select(
        'id, name, sku, reorder_level, category:categories!products_category_id_fkey(name), uom:uom(abbreviation), stock:stock_batches(quantity_remaining)',
      );
    if (error) throw error;
    return data.map((p) => {
      const stock =
        p.stock?.reduce((sum, b) => sum + (b.quantity_remaining || 0), 0) || 0;
      return {
        ...p,
        stock_level: stock,
        is_low_stock: stock <= (p.reorder_level || 0),
      };
    });
  }

  async getSalesReport(startDate?: string, endDate?: string) {
    let query = this.supabaseService
      .getAdminClient()
      .from('sales_orders')
      .select(
        '*, customer:customers(id, name), payment_method:payment_methods(id, name, type), items:sales_order_items(quantity, total, unit_price, discount, costs:sales_order_item_costs(quantity, unit_cost))',
      )
      .filter('status', 'ilike', 'completed');
    if (startDate) query = query.gte('order_date', startDate);
    if (endDate) query = query.lte('order_date', endDate);
    const { data, error } = await query.order('order_date', {
      ascending: false,
    });
    if (error) throw error;

    return data?.map((o: any) => {
      let cogs = 0;
      let itemDiscount = 0;
      o.items?.forEach((item: any) => {
        if (item.costs && item.costs.length > 0) {
          item.costs.forEach((cost: any) => {
            cogs += Number(cost.quantity) * Number(cost.unit_cost);
          });
        }
        itemDiscount += Number(item.discount ?? 0);
      });
      const revenue = Number(o.subtotal ?? o.total_amount ?? 0);
      const profit = revenue - cogs;
      const profitMargin = revenue > 0 ? Number(((profit / revenue) * 100).toFixed(2)) : 0;
      const date = o.order_date
        ? o.order_date.slice(0, 10)
        : o.created_at?.slice(0, 10);

      return {
        id: o.id,
        order_number: o.order_number,
        date,
        customer: o.customer ? { id: o.customer.id, name: o.customer.name } : null,
        payment_method: o.payment_method
          ? { id: o.payment_method.id, name: o.payment_method.name, type: o.payment_method.type }
          : null,
        revenue,
        cogs: Number(cogs.toFixed(4)),
        profit: Number(profit.toFixed(4)),
        profit_margin: profitMargin,
        // Order-level manual discount (set at checkout) vs. the sum of
        // per-item discounts applied on individual line items.
        discount: Number(o.discount ?? 0),
        item_discount: Number(itemDiscount.toFixed(4)),
        tax: Number(o.tax ?? 0),
        total_amount: Number(o.total_amount ?? 0),
      };
    }) ?? [];
  }

  async getSalesByCustomerReport() {
    const { data: sales, error } = await this.supabaseService
      .getAdminClient()
      .from('sales_orders')
      .select('total_amount, customer:customers(name)')
      .filter('status', 'ilike', 'completed');
    if (error) throw error;
    const customerSales: Record<string, number> = {};
    sales?.forEach((s: any) => {
      const name = s.customer?.name || 'Walk-in Customer';
      customerSales[name] = (customerSales[name] || 0) + Number(s.total_amount);
    });
    return Object.entries(customerSales)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }

  async getSalesByPaymentMethodReport(startDate?: string, endDate?: string) {
    let query = this.supabaseService
      .getAdminClient()
      .from('sales_orders')
      .select('total_amount, order_date, created_at, payment_method:payment_methods(id, name, type)')
      .filter('status', 'ilike', 'completed');
    if (startDate) query = query.gte('order_date', startDate);
    if (endDate) query = query.lte('order_date', endDate);
    const { data, error } = await query;
    if (error) throw error;

    const totals: Record<string, { name: string; type: string | null; total: number; orderCount: number }> = {};
    data?.forEach((o: any) => {
      const key = o.payment_method?.id ?? 'unspecified';
      const name = o.payment_method?.name ?? 'Unspecified';
      if (!totals[key]) {
        totals[key] = { name, type: o.payment_method?.type ?? null, total: 0, orderCount: 0 };
      }
      totals[key].total += Number(o.total_amount ?? 0);
      totals[key].orderCount += 1;
    });

    return Object.entries(totals)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total);
  }

  async getSalesByProductReport(startDate?: string, endDate?: string) {
    let query = this.supabaseService
      .getAdminClient()
      .from('sales_order_items')
      .select(
        `quantity, total, unit_price, product:products(id, name, sku), sales_order:sales_orders!inner(id, status, created_at)`,
      )
      .filter('sales_order.status', 'ilike', 'completed');
    if (startDate)
      query = query.gte('sales_order.created_at', `${startDate}T00:00:00`);
    if (endDate)
      query = query.lte('sales_order.created_at', `${endDate}T23:59:59`);
    const { data: items, error } = await query;
    if (error) throw error;

    const productSales: Record<
      string,
      { name: string; sku: string; quantity: number; revenue: number }
    > = {};
    items?.forEach((item: any) => {
      const productId = item.product?.id;
      if (!productId) return;
      if (!productSales[productId])
        productSales[productId] = {
          name: item.product.name,
          sku: item.product.sku,
          quantity: 0,
          revenue: 0,
        };
      productSales[productId].quantity += Number(item.quantity || 0);
      productSales[productId].revenue += Number(item.total || 0);
    });
    return Object.entries(productSales)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  async getDailyRevenueReport(storeId: string, days = 30) {
    const span = Math.max(1, Math.min(days, 365));
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (span - 1));
    const startStr = start.toISOString().slice(0, 10);

    let query = this.supabaseService
      .getAdminClient()
      .from('sales_orders')
      .select(
        'total_amount, order_date, created_at, items:sales_order_items(total, costs:sales_order_item_costs(quantity, unit_cost))',
      )
      .filter('status', 'ilike', 'completed')
      .gte('created_at', `${startStr}T00:00:00`);
    if (storeId) query = query.eq('store_id', storeId);

    const { data, error } = await query;
    if (error) throw error;

    const revenues: Record<string, number> = {};
    const profits: Record<string, number> = {};
    data?.forEach((o: any) => {
      const day = (o.order_date || o.created_at || '').slice(0, 10);
      if (!day) return;
      const revenue = Number(o.total_amount || 0);
      let cogs = 0;
      o.items?.forEach((item: any) => {
        item.costs?.forEach((c: any) => {
          cogs += Number(c.quantity || 0) * Number(c.unit_cost || 0);
        });
      });
      revenues[day] = (revenues[day] || 0) + revenue;
      profits[day] = (profits[day] || 0) + (revenue - cogs);
    });

    // Emit a continuous series covering every day in the window.
    const result: { date: string; revenue: number; profit: number }[] = [];
    for (let i = 0; i < span; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      result.push({
        date: key,
        revenue: Number((revenues[key] || 0).toFixed(2)),
        profit: Number((profits[key] || 0).toFixed(2)),
      });
    }
    return result;
  }

  async getSalesByCategoryReport(startDate?: string, endDate?: string) {
    let query = this.supabaseService
      .getAdminClient()
      .from('sales_order_items')
      .select(
        `total, quantity, product:products(category:categories!products_category_id_fkey(id, name)), sales_order:sales_orders!inner(id, status, created_at)`,
      )
      .filter('sales_order.status', 'ilike', 'completed');
    if (startDate)
      query = query.gte('sales_order.created_at', `${startDate}T00:00:00`);
    if (endDate)
      query = query.lte('sales_order.created_at', `${endDate}T23:59:59`);
    const { data: items, error } = await query;
    if (error) throw error;

    const byCategory: Record<
      string,
      { category: string; revenue: number; quantity: number }
    > = {};
    items?.forEach((item: any) => {
      const name = item.product?.category?.name || 'Uncategorized';
      if (!byCategory[name])
        byCategory[name] = { category: name, revenue: 0, quantity: 0 };
      byCategory[name].revenue += Number(item.total || 0);
      byCategory[name].quantity += Number(item.quantity || 0);
    });

    const rows = Object.values(byCategory).sort(
      (a, b) => b.revenue - a.revenue,
    );
    const total = rows.reduce((sum, r) => sum + r.revenue, 0);
    return rows.map((r) => ({
      ...r,
      percentage: total > 0 ? Math.round((r.revenue / total) * 100) : 0,
    }));
  }

  async getMonthlyProfitLoss(storeId: string, year: number, month: number) {
    if (!storeId) return { totalIncome: 0, totalExpenses: 0, netProfit: 0, profitMargin: 0, incomeByCategory: {}, expenseByCategory: {} };
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    const [incomeResult, expenseResult] = await Promise.all([
      this.supabaseService
        .getAdminClient()
        .from('income')
        .select('amount, category')
        .eq('store_id', storeId)
        .gte('date', startDate)
        .lte('date', endDate),
      this.supabaseService
        .getAdminClient()
        .from('expenses')
        .select('amount, category')
        .eq('store_id', storeId)
        .gte('date', startDate)
        .lte('date', endDate),
    ]);

    const totalIncome =
      incomeResult.data?.reduce((sum, r) => sum + Number(r.amount || 0), 0) || 0;
    const totalExpenses =
      expenseResult.data?.reduce((sum, r) => sum + Number(r.amount || 0), 0) || 0;
    const netProfit = totalIncome - totalExpenses;

    const incomeByCategory: Record<string, number> = {};
    incomeResult.data?.forEach((r) => {
      const cat = r.category || 'uncategorized';
      incomeByCategory[cat] = (incomeByCategory[cat] || 0) + Number(r.amount || 0);
    });

    const expenseByCategory: Record<string, number> = {};
    expenseResult.data?.forEach((r) => {
      const cat = r.category || 'uncategorized';
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(r.amount || 0);
    });

    return {
      year,
      month,
      startDate,
      endDate,
      totalIncome,
      totalExpenses,
      netProfit,
      profitMargin: totalIncome > 0 ? Number(((netProfit / totalIncome) * 100).toFixed(2)) : 0,
      incomeByCategory,
      expenseByCategory,
    };
  }

  async getYearlyProfitLoss(storeId: string, year: number) {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    let salesQuery = this.supabaseService
      .getAdminClient()
      .from('sales_orders')
      .select(
        'subtotal, order_date, created_at, items:sales_order_items(costs:sales_order_item_costs(quantity, unit_cost))',
      )
      .filter('status', 'ilike', 'completed')
      .gte('order_date', startDate)
      .lte('order_date', endDate);

    if (storeId) salesQuery = salesQuery.eq('store_id', storeId);

    let expensesQuery = this.supabaseService
      .getAdminClient()
      .from('expenses')
      .select('amount, date')
      .gte('date', startDate)
      .lte('date', endDate);

    if (storeId) expensesQuery = expensesQuery.eq('store_id', storeId);

    const [salesResult, expensesResult] = await Promise.all([
      salesQuery,
      expensesQuery,
    ]);

    const months: Record<number, { revenue: number; cogs: number; expenses: number }> = {};
    for (let m = 1; m <= 12; m++) months[m] = { revenue: 0, cogs: 0, expenses: 0 };

    salesResult.data?.forEach((order: any) => {
      const dateStr = order.order_date || order.created_at?.slice(0, 10);
      if (!dateStr) return;
      const month = parseInt(dateStr.slice(5, 7), 10);
      if (month < 1 || month > 12) return;
      months[month].revenue += Number(order.subtotal || 0);
      order.items?.forEach((item: any) => {
        item.costs?.forEach((cost: any) => {
          months[month].cogs += Number(cost.quantity) * Number(cost.unit_cost);
        });
      });
    });

    expensesResult.data?.forEach((expense: any) => {
      if (!expense.date) return;
      const month = parseInt(expense.date.slice(5, 7), 10);
      if (month < 1 || month > 12) return;
      months[month].expenses += Number(expense.amount || 0);
    });

    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    return Object.entries(months).map(([m, data]) => ({
      month: parseInt(m),
      monthName: MONTH_NAMES[parseInt(m) - 1],
      revenue: Number(data.revenue.toFixed(2)),
      cogs: Number(data.cogs.toFixed(2)),
      expenses: Number(data.expenses.toFixed(2)),
      grossProfit: Number((data.revenue - data.cogs).toFixed(2)),
      netProfit: Number((data.revenue - data.cogs - data.expenses).toFixed(2)),
    }));
  }

  async getProductSuppliersReport() {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('purchase_inventory')
      .select(
        `product_id, product:products(name, sku), purchase_order:purchase_orders!inner(supplier:suppliers(id, name))`,
      );
    if (error) throw error;

    const productSuppliers: Record<
      string,
      {
        name: string;
        sku: string;
        suppliers: Set<string>;
        supplierDetails: { id: string; name: string }[];
      }
    > = {};
    data?.forEach((item: any) => {
      const productId = item.product_id;
      const supplier = item.purchase_order?.supplier;
      if (!productId || !supplier) return;
      if (!productSuppliers[productId])
        productSuppliers[productId] = {
          name: item.product.name,
          sku: item.product.sku,
          suppliers: new Set(),
          supplierDetails: [],
        };
      if (!productSuppliers[productId].suppliers.has(supplier.id)) {
        productSuppliers[productId].suppliers.add(supplier.id);
        productSuppliers[productId].supplierDetails.push(supplier);
      }
    });
    return Object.entries(productSuppliers)
      .map(([id, data]) => ({
        id,
        name: data.name,
        sku: data.sku,
        suppliers: data.supplierDetails,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Stock traced back to the supplier it was bought from.
   *
   * Every received purchase order creates one stock batch per line, carrying
   * the unit cost paid and how much of it is still on hand (FIFO sales and
   * adjustments draw it down). Grouping batches by product × supplier answers
   * "what did this cost from each supplier, and how much of it is left".
   * Batches added by hand (no purchase order) are grouped under "No supplier".
   *
   * A positive stock adjustment is added onto the product's latest batch, so a
   * batch can hold more than was bought. That surplus is reported separately as
   * `qtyAdded` rather than as negative "used" stock.
   */
  async getSupplierStockReport() {
    const batches = await this.fetchAllStockBatches();

    type Txn = {
      batchId: string;
      batchNumber: string | null;
      date: string | null;
      poId: string | null;
      poNumber: string | null;
      qtyReceived: number;
      qtyRemaining: number;
      unitCost: number;
      totalCost: number;
    };
    type Item = {
      key: string;
      product: { id: string; name: string; sku: string | null; image_url: string | null; price: number | null };
      variant: { id: string; name: string; sku: string | null } | null;
      supplier: { id: string | null; name: string };
      transactions: Txn[];
    };

    const NO_SUPPLIER = { id: null, name: 'No supplier (manual stock)' };
    const items = new Map<string, Item>();

    for (const b of batches) {
      if (!b.product) continue;
      const po = b.purchase_order;
      const supplier = po
        ? {
            id: po.supplier?.id ?? po.supplier_id ?? null,
            name: po.supplier?.name ?? po.supplier_name ?? 'Unknown supplier',
          }
        : NO_SUPPLIER;

      const key = [b.product_id, b.variant_id ?? '', supplier.id ?? supplier.name].join('|');
      if (!items.has(key)) {
        items.set(key, {
          key,
          product: {
            id: b.product.id,
            name: b.product.name,
            sku: b.product.sku ?? null,
            image_url: b.product.image_url ?? null,
            price: b.product.price != null ? Number(b.product.price) : null,
          },
          variant: b.variant ? { id: b.variant.id, name: b.variant.name, sku: b.variant.sku ?? null } : null,
          supplier,
          transactions: [],
        });
      }

      const qtyReceived = Number(b.quantity_received) || 0;
      const unitCost = Number(b.unit_cost) || 0;
      items.get(key)!.transactions.push({
        batchId: b.id,
        batchNumber: b.batch_number ?? null,
        date: b.received_date ?? po?.order_date ?? b.created_at ?? null,
        poId: po?.id ?? null,
        poNumber: po?.order_number ?? null,
        qtyReceived,
        qtyRemaining: Number(b.quantity_remaining) || 0,
        unitCost,
        totalCost: this.round2(qtyReceived * unitCost),
      });
    }

    const rows = [...items.values()].map((item) => {
      // Newest first for display; "last" cost is the most recent purchase.
      const txns = item.transactions.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
      const qtyPurchased = txns.reduce((n, t) => n + t.qtyReceived, 0);
      const qtyRemaining = txns.reduce((n, t) => n + t.qtyRemaining, 0);
      const purchaseCost = txns.reduce((n, t) => n + t.qtyReceived * t.unitCost, 0);
      const remainingValue = txns.reduce((n, t) => n + t.qtyRemaining * t.unitCost, 0);
      const costs = txns.map((t) => t.unitCost);
      return {
        ...item,
        transactions: txns,
        purchases: txns.length,
        qtyPurchased,
        qtyRemaining,
        qtyUsed: txns.reduce((n, t) => n + Math.max(0, t.qtyReceived - t.qtyRemaining), 0),
        qtyAdded: txns.reduce((n, t) => n + Math.max(0, t.qtyRemaining - t.qtyReceived), 0),
        // Weighted by quantity, so one small top-up doesn't skew the average.
        avgUnitCost: qtyPurchased > 0 ? this.round2(purchaseCost / qtyPurchased) : 0,
        lastUnitCost: txns[0]?.unitCost ?? 0,
        minUnitCost: costs.length ? Math.min(...costs) : 0,
        maxUnitCost: costs.length ? Math.max(...costs) : 0,
        purchaseCost: this.round2(purchaseCost),
        remainingValue: this.round2(remainingValue),
        firstPurchaseDate: txns[txns.length - 1]?.date ?? null,
        lastPurchaseDate: txns[0]?.date ?? null,
      };
    });

    rows.sort(
      (a, b) =>
        a.product.name.localeCompare(b.product.name) ||
        (a.variant?.name ?? '').localeCompare(b.variant?.name ?? '') ||
        a.supplier.name.localeCompare(b.supplier.name),
    );

    const bySupplier = new Map<string, any>();
    for (const r of rows) {
      const k = r.supplier.id ?? r.supplier.name;
      const s =
        bySupplier.get(k) ??
        bySupplier
          .set(k, {
            supplier: r.supplier,
            products: 0,
            orders: new Set<string>(),
            qtyPurchased: 0,
            qtyRemaining: 0,
            purchaseCost: 0,
            remainingValue: 0,
            lastPurchaseDate: null as string | null,
          })
          .get(k);
      s.products += 1;
      r.transactions.forEach((t) => s.orders.add(t.poId ?? t.batchId));
      s.qtyPurchased += r.qtyPurchased;
      s.qtyRemaining += r.qtyRemaining;
      s.purchaseCost += r.purchaseCost;
      s.remainingValue += r.remainingValue;
      if ((r.lastPurchaseDate ?? '') > (s.lastPurchaseDate ?? '')) s.lastPurchaseDate = r.lastPurchaseDate;
    }

    const suppliers = [...bySupplier.values()]
      .map(({ orders, ...s }) => ({
        ...s,
        purchases: orders.size,
        purchaseCost: this.round2(s.purchaseCost),
        remainingValue: this.round2(s.remainingValue),
      }))
      .sort((a, b) => b.purchaseCost - a.purchaseCost);

    return {
      summary: {
        suppliers: suppliers.filter((s) => s.supplier !== NO_SUPPLIER).length,
        products: new Set(rows.map((r) => r.product.id)).size,
        purchases: batches.length,
        qtyPurchased: rows.reduce((n, r) => n + r.qtyPurchased, 0),
        qtyRemaining: rows.reduce((n, r) => n + r.qtyRemaining, 0),
        purchaseCost: this.round2(rows.reduce((n, r) => n + r.purchaseCost, 0)),
        remainingValue: this.round2(rows.reduce((n, r) => n + r.remainingValue, 0)),
      },
      suppliers,
      items: rows,
    };
  }

  /** PostgREST returns at most 1000 rows per request, so page through them. */
  private async fetchAllStockBatches() {
    const PAGE = 1000;
    const all: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('stock_batches')
        .select(
          'id, batch_number, product_id, variant_id, quantity_received, quantity_remaining, unit_cost, received_date, created_at, ' +
            'product:products(id, name, sku, image_url, price), ' +
            'variant:product_variants(id, name, sku), ' +
            'purchase_order:purchase_orders(id, order_number, order_date, supplier_id, supplier_name, supplier:suppliers(id, name))',
        )
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      all.push(...(data ?? []));
      if (!data || data.length < PAGE) return all;
    }
  }

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }
}

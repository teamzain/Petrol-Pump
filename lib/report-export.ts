import { format } from "date-fns"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { getTodayPKT } from "./utils"

export type ExportType = "csv" | "pdf"

interface ExportOptions {
    activeTab: string
    reportData: any
    filters: any
    stationName?: string
}

export function exportReport({ activeTab, reportData, filters, stationName = "United Filling Station" }: ExportOptions, type: ExportType) {
    if (!reportData) return

    try {
        const dateRangeStr = filters.dateRange.from && filters.dateRange.to
            ? `${format(filters.dateRange.from, "MMM dd, yyyy")} - ${format(filters.dateRange.to, "MMM dd, yyyy")}`
            : format(new Date(), "MMM dd, yyyy")

        if (type === "csv") {
            exportToCSV(activeTab, reportData, dateRangeStr)
        } else {
            exportToPDF(activeTab, reportData, dateRangeStr, stationName)
        }
    } catch (error) {
        console.error(`Error exporting ${type} report:`, error)
        alert(`Failed to export ${type} report. Please check the console for details.`)
    }
}

function exportToCSV(activeTab: string, reportData: any, dateRangeStr: string) {
    let csvContent = "data:text/csv;charset=utf-8,"
    let fileName = `report-${activeTab}-${getTodayPKT()}.csv`

    if (activeTab === "daily-summary" && reportData.stockMovements) {
        const headers = ["Product", "Type", "Quantity", "Balance After", "Date"]
        csvContent += headers.join(",") + "\n"
        reportData.stockMovements.forEach((m: any) => {
            const row = [
                m.products?.product_name || "N/A",
                m.movement_type,
                m.quantity,
                m.balance_after,
                format(new Date(m.movement_date || m.created_at || new Date()), "yyyy-MM-dd")
            ]
            csvContent += row.join(",") + "\n"
        })
    } else if (activeTab === "sales-analysis" && reportData.breakdownData) {
        const headers = ["Product", "Volume", "Revenue", "Profit"]
        csvContent += headers.join(",") + "\n"
        reportData.breakdownData.forEach((d: any) => {
            const row = [d.name, d.volume, d.revenue, d.profit]
            csvContent += row.join(",") + "\n"
        })
    } else if (activeTab === "purchase-history" && Array.isArray(reportData)) {
        const headers = ["Date", "Invoice", "Supplier", "Amount", "Status"]
        csvContent += headers.join(",") + "\n"
        reportData.forEach((o: any) => {
            const row = [
                o.purchase_date,
                o.invoice_number,
                o.suppliers?.supplier_name || "N/A",
                o.total_amount,
                o.status
            ]
            csvContent += row.join(",") + "\n"
        })
    } else if (activeTab === "expense-breakdown" && reportData.expenses) {
        const headers = ["Date", "Category", "Amount", "Method", "Notes"]
        csvContent += headers.join(",") + "\n"
        reportData.expenses.forEach((e: any) => {
            const row = [
                e.expense_date,
                e.expense_categories?.category_name || "N/A",
                e.amount,
                e.payment_method,
                e.description || ""
            ]
            csvContent += row.join(",") + "\n"
        })
    } else if (activeTab === "supplier-tracking" && Array.isArray(reportData)) {
        const headers = ["Supplier", "Type", "Period Purchases", "Lifetime Total", "Outstanding Dues"]
        csvContent += headers.join(",") + "\n"
        reportData.forEach((s: any) => {
            const row = [
                s.supplier_name,
                s.supplier_type,
                s.periodPurchases,
                s.total_purchases,
                s.outstandingDues
            ]
            csvContent += row.join(",") + "\n"
        })
    } else {
        csvContent += "Data Error: Export not fully configured for this tab yet."
    }

    const encodedUri = encodeURI(csvContent)
    const link = document.body.appendChild(document.createElement("a"))
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", fileName)
    link.click()
    document.body.removeChild(link)
}

function exportToPDF(activeTab: string, reportData: any, dateRangeStr: string, stationName: string) {
    const doc = new jsPDF()
    const title = activeTab.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")

    // Header
    doc.setFontSize(20)
    doc.setTextColor(40)
    doc.text(stationName, 14, 22)

    doc.setFontSize(14)
    doc.setTextColor(100)
    doc.text(`${title} Report`, 14, 32)

    doc.setFontSize(10)
    doc.text(`Period: ${dateRangeStr}`, 14, 40)
    doc.text(`Generated on: ${format(new Date(), "PPpp")}`, 14, 46)

    let tableData: any[] = []
    let tableHeaders: string[] = []

    if (activeTab === "daily-summary" && reportData.stockMovements) {
        tableHeaders = ["Product", "Type", "Quantity", "Balance After", "Date"]
        tableData = reportData.stockMovements.map((m: any) => [
            m.products?.product_name || "N/A",
            m.movement_type,
            m.quantity,
            m.balance_after,
            format(new Date(m.movement_date || m.created_at || new Date()), "MMM dd, yyyy")
        ])
    } else if (activeTab === "sales-analysis" && reportData.breakdownData) {
        tableHeaders = ["Product", "Volume", "Revenue (Rs.)", "Profit (Rs.)"]
        tableData = reportData.breakdownData.map((d: any) => [
            d.name,
            d.volume.toLocaleString(),
            d.revenue.toLocaleString(),
            d.profit.toLocaleString()
        ])
    } else if (activeTab === "purchase-history" && Array.isArray(reportData)) {
        tableHeaders = ["Date", "Invoice", "Supplier", "Amount (Rs.)", "Status"]
        tableData = reportData.map((o: any) => [
            o.purchase_date,
            o.invoice_number,
            o.suppliers?.supplier_name || "N/A",
            o.total_amount.toLocaleString(),
            o.status
        ])
    } else if (activeTab === "expense-breakdown" && reportData.expenses) {
        tableHeaders = ["Date", "Category", "Amount (Rs.)", "Method", "Notes"]
        tableData = reportData.expenses.map((e: any) => [
            e.expense_date,
            e.expense_categories?.category_name || "N/A",
            e.amount.toLocaleString(),
            e.payment_method,
            e.description || ""
        ])
    } else if (activeTab === "supplier-tracking" && Array.isArray(reportData)) {
        tableHeaders = ["Supplier", "Type", "Period Purchases", "Lifetime Total", "Outstanding Dues"]
        tableData = reportData.map((s: any) => [
            s.supplier_name,
            s.supplier_type,
            s.periodPurchases.toLocaleString(),
            s.total_purchases.toLocaleString(),
            s.outstandingDues.toLocaleString()
        ])
    } else if (activeTab === "profit-loss" && reportData) {
        // Custom P&L formatting
        autoTable(doc, {
            startY: 55,
            head: [["Category", "Amount (Rs.)"]],
            body: [
                ["Total Revenue", reportData.totalRevenue?.toLocaleString() || "0"],
                ["Total Cost of Goods", reportData.totalCOG?.toLocaleString() || "0"],
                ["Gross Profit", reportData.grossProfit?.toLocaleString() || "0"],
                ["Total Expenses", reportData.totalExpenses?.toLocaleString() || "0"],
                ["Net Profit", reportData.netProfit?.toLocaleString() || "0"],
            ],
            theme: 'striped',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        })
        doc.save(`report-${activeTab}-${getTodayPKT()}.pdf`)
        return
    }

    if (tableHeaders.length > 0) {
        autoTable(doc, {
            startY: 55,
            head: [tableHeaders],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            margin: { top: 55 },
        })
    } else {
        doc.setFontSize(12)
        doc.text("No data available for this report type or export not yet fully implemented.", 14, 60)
    }

    doc.save(`report-${activeTab}-${getTodayPKT()}.pdf`)
}

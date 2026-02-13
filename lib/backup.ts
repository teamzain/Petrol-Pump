import { createClient } from "./supabase/client"

export async function exportAllData() {
    const supabase = createClient()
    const tables = [
        "pump_config",
        "users",
        "suppliers",
        "products",
        "nozzles",
        "accounts",
        "daily_balances",
        "transactions",
        "sales",
        "purchase_orders",
        "purchases",
        "expenses",
        "daily_operations",
        "nozzle_readings",
        "stock_movements",
        "price_history",
        "opening_balance",
        "expense_categories",
    ]

    try {
        const backupData: Record<string, any> = {
            backup_date: new Date().toISOString(),
            version: "1.0",
            data: {}
        }

        const fetchPromises = tables.map(async (table) => {
            const { data, error } = await supabase.from(table).select("*")
            if (error) {
                console.error(`Error fetching data from ${table}:`, error)
                return { table, data: [], error }
            }
            return { table, data }
        })

        const results = await Promise.all(fetchPromises)

        results.forEach((result) => {
            backupData.data[result.table] = result.data
        })

        // Create and trigger download
        const jsonString = JSON.stringify(backupData, null, 2)
        const blob = new Blob([jsonString], { type: "application/json" })
        const url = URL.createObjectURL(blob)

        const link = document.createElement("a")
        link.href = url
        link.download = `petrol-pump-backup-${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        return { success: true }
    } catch (error) {
        console.error("Backup failed:", error)
        return { success: false, error }
    }
}

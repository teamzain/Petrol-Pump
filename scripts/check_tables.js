
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Manually parse .env.local
try {
    const envPath = path.resolve(__dirname, "../.env.local");
    const envFile = fs.readFileSync(envPath, "utf8");

    envFile.split("\n").forEach(line => {
        const [key, value] = line.split("=");
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
} catch (e) {
    console.error("Failed to read .env.local:", e.message);
    process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
    console.log("Checking tables...");

    // List of known tables from our schema
    const tables = [
        "users",
        "pump_config",
        "opening_balance",
        "suppliers",
        "products",
        "price_history",
        "stock_movements",
        "purchases",
        "accounts",
        "transactions",
        "expense_categories",
        "daily_operations",
        "nozzles",
        "nozzle_readings",
        "sales",
        "shift_logs", // Checking if this exists
        "daily_balances" // Checking if this exists
    ];

    for (const table of tables) {
        const { count, error } = await supabase
            .from(table)
            .select("*", { count: "exact", head: true });

        if (error) {
            if (error.code === '42P01') {
                console.log(`[MISSING] ${table}`);
            } else {
                console.log(`[ERROR] ${table}: ${error.message} (${error.code})`);
            }
        } else {
            console.log(`[EXISTS] ${table}: ${count} rows`);
        }
    }
}

checkTables();

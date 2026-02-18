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
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function debugBalances() {
    console.log("--- Debugging Balances ---");

    try {
        // 1. Check Accounts
        console.log("\nActive Accounts:");
        const { data: accounts, error: accError } = await supabase
            .from("accounts")
            .select("id, account_name, account_type, current_balance, status")
            .eq("status", "active");

        if (accError) throw accError;
        console.table(accounts);

        // 2. Check Recent Transactions
        console.log("\nRecent Transactions (Last 5):");
        const { data: transactions, error: transError } = await supabase
            .from("transactions")
            .select("id, transaction_date, description, amount, payment_method, to_account, reference_type")
            .order("created_at", { ascending: false })
            .limit(5);

        if (transError) throw transError;
        console.table(transactions);

        // 3. Check Nozzle Readings
        console.log("\nRecent Nozzle Readings (Last 3):");
        const { data: readings, error: readingsError } = await supabase
            .from("nozzle_readings")
            .select("id, reading_date, sale_amount, total_card_amount, card_breakdown")
            .order("created_at", { ascending: false })
            .limit(3);

        if (readingsError) throw readingsError;
        console.table(readings);

    } catch (err) {
        console.error("Debug failed:", err.message);
    }
}

debugBalances();

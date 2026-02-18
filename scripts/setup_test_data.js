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

async function setup() {
    console.log("--- Setting up Test Data ---");

    try {
        // 1. Create Cash Account if missing
        const { data: cashAcc } = await supabase.from("accounts").select("id").eq("account_type", "cash").limit(1).single();
        if (!cashAcc) {
            console.log("Creating Cash Account...");
            await supabase.from("accounts").insert({ account_name: "Cash", account_type: "cash", current_balance: 1000 }).select();
        }

        // 2. Create Bank Account
        const { data: bankAcc } = await supabase.from("accounts").insert({
            account_name: "Test Bank",
            account_type: "bank",
            current_balance: 1000,
            account_number: "123456789",
            status: "active"
        }).select().single();
        console.log("Created Bank Account:", bankAcc.id);

        // 3. Create Supplier
        const { data: supplier } = await supabase.from("suppliers").insert({
            supplier_name: "Test Supplier",
            supplier_type: "both_petrol_diesel",
            status: "active",
            account_balance: 0
        }).select().single();
        console.log("Created Supplier:", supplier.id);

        // 4. Create Daily Balance for today
        const today = new Date().toISOString().split('T')[0];
        const { data: dailyBal } = await supabase.from("daily_balances").insert({
            balance_date: today,
            cash_opening: 1000,
            bank_opening: 1000,
            cash_closing: 1000,
            bank_closing: 1000,
            is_closed: false
        }).select().single();
        console.log("Created Daily Balance for:", today);

        console.log("Test data setup complete!");

    } catch (err) {
        console.error("Setup failed:", err.message);
    }
}

setup();

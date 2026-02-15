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

async function checkDuplicates() {
    console.log("Checking for 'Purchase: INV-N/A' duplicates...");

    const { data, error } = await supabase
        .from("transactions")
        .select("id, transaction_date, description, amount, reference_type, reference_id")
        .ilike("description", "%Purchase%")
        .order("transaction_date", { ascending: false })
        .limit(20);

    if (error) {
        console.error("Error fetching transactions:", error);
        return;
    }

    console.log("Found recent transactions:");
    data.forEach(tx => {
        console.log(`[${tx.transaction_date}] ${tx.description} | Type: ${tx.reference_type} | ID: ${tx.id} | Amt: ${tx.amount}`);
    });
}

checkDuplicates();

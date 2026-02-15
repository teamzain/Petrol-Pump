const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

try {
    const envPath = path.resolve(__dirname, "../.env.local");
    const envFile = fs.readFileSync(envPath, "utf8");
    envFile.split("\n").forEach(line => {
        const [key, value] = line.split("=");
        if (key && value) process.env[key.trim()] = value.trim();
    });
} catch (e) {
    console.error("Failed to read .env.local:", e.message);
    process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkAccounts() {
    console.log("Checking Accounts Table...");
    const { data, error } = await supabase
        .from("accounts")
        .select("id, account_name, account_type, status, current_balance");

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.table(data);
}

checkAccounts();

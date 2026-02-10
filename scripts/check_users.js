
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

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugUsers() {
    console.log("Testing public.users table access...");

    // 1. Try to select all from users
    const { data, error } = await supabase.from("users").select("*").limit(5);

    if (error) {
        console.error("QUERY ERROR:", JSON.stringify(error, null, 2));
        if (error.code === "42P01") {
            console.error("Table public.users does not exist.");
        }
    } else {
        console.log("Success! Found users:", data?.length);
        if (data && data.length > 0) {
            console.log("Sample User:", data[0]);
        } else {
            console.log("Table exists but is empty.");
        }
    }
}

debugUsers();

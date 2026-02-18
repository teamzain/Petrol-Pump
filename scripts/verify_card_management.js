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

async function verifyCardManagement() {
    console.log("--- Verifying Card Management Fix ---");

    try {
        // 1. Create a dummy card type
        console.log("Creating test card type...");
        const { data: ct, error: createError } = await supabase.from("card_types").insert({
            card_name: "Test Management Card",
            tax_percentage: 2.5,
            is_active: true
        }).select().single();

        if (createError) throw createError;
        console.log("Created Card ID:", ct.id);

        // 2. Test Editing (Name and Tax) - simulated
        console.log("Simulating Edit...");
        const { error: editError } = await supabase.from("card_types").update({
            card_name: "Edited Card Name",
            tax_percentage: 3.0
        }).eq("id", ct.id);

        if (editError) throw editError;
        const { data: editedCt } = await supabase.from("card_types").select("*").eq("id", ct.id).single();
        if (editedCt.card_name === "Edited Card Name" && Number(editedCt.tax_percentage) === 3.0) {
            console.log("✅ SUCCESS: Card edit working!");
        } else {
            console.error("❌ FAILURE: Card edit failed.", editedCt);
        }

        // 3. Test Toggle Inactive
        console.log("Simulating Deactivation...");
        const { error: toggleError } = await supabase.from("card_types").update({
            is_active: false
        }).eq("id", ct.id);

        if (toggleError) throw toggleError;
        const { data: deactiveCt } = await supabase.from("card_types").select("*").eq("id", ct.id).single();
        if (deactiveCt.is_active === false) {
            console.log("✅ SUCCESS: Card deactivation working!");
        } else {
            console.error("❌ FAILURE: Card deactivation failed.");
        }

        // 4. Test Toggle Active
        console.log("Simulating Reactivation...");
        await supabase.from("card_types").update({ is_active: true }).eq("id", ct.id);
        const { data: activeCt } = await supabase.from("card_types").select("*").eq("id", ct.id).single();
        if (activeCt.is_active === true) {
            console.log("✅ SUCCESS: Card reactivation working!");
        } else {
            console.error("❌ FAILURE: Card reactivation failed.");
        }

        // CLEANUP
        console.log("Cleaning up test card...");
        await supabase.from("card_types").delete().eq("id", ct.id);
        console.log("Cleanup complete.");

    } catch (err) {
        console.error("Verification failed:", err.message);
    }
}

verifyCardManagement();

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://lpiaqgvryyccfrwtdnpb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaWFxZ3ZyeXljY2Zyd3RkbnBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTA4MTYsImV4cCI6MjA4NjIyNjgxNn0.nMw2RYKYq3mJ2eTdyTeoquFFbkXRcYbyN7wkXaRejUw";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Checking Purchases and Products...");

    const { data: po, error: poe } = await supabase.from("purchase_orders").select("*");
    const { data: p, error: pe } = await supabase.from("products").select("product_name, current_stock, purchase_price, selling_price");

    if (poe) console.error("PO Error:", poe.message);
    else {
        console.log("Purchase Orders:");
        console.table(po);
    }

    if (pe) console.error("Product Error:", pe.message);
    else {
        console.log("Products:");
        console.table(p);
    }
}

check();

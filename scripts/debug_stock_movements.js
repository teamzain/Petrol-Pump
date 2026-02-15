const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://lpiaqgvryyccfrwtdnpb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaWFxZ3ZyeXljY2Zyd3RkbnBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTA4MTYsImV4cCI6MjA4NjIyNjgxNn0.nMw2RYKYq3mJ2eTdyTeoquFFbkXRcYbyN7wkXaRejUw";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Checking Stock Movements...");

    const { data, error } = await supabase
        .from("stock_movements")
        .select("quantity, movement_type, movement_date, unit_price, balance_after, products(product_name)")
        .order("movement_date", { ascending: false })
        .limit(20);

    if (error) {
        console.error("Error:", error.message);
    } else {
        console.table(data.map(m => ({
            product: m.products?.product_name,
            type: m.movement_type,
            qty: m.quantity,
            price: m.unit_price,
            balance: m.balance_after,
            date: m.movement_date
        })));
    }
}

check();

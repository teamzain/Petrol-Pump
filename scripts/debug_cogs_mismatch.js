const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://lpiaqgvryyccfrwtdnpb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaWFxZ3ZyeXljY2Zyd3RkbnBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTA4MTYsImV4cCI6MjA4NjIyNjgxNn0.nMw2RYKYq3mJ2eTdyTeoquFFbkXRcYbyN7wkXaRejUw";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Checking Sales and Nozzle Readings COGS...");

    const { data: nr } = await supabase
        .from("nozzle_readings")
        .select("sale_amount, gross_profit, cogs_per_unit, quantity_sold, nozzles(nozzle_number, products(product_name))");

    const { data: s } = await supabase
        .from("sales")
        .select("sale_amount, gross_profit, cogs_per_unit, quantity, products(product_name)");

    console.log("Nozzle Readings (Fuel):");
    console.table(nr?.map(n => ({
        product: n.nozzles?.products?.product_name,
        qty: n.quantity_sold,
        sale: n.sale_amount,
        gp: n.gross_profit,
        cogs_unit: n.cogs_per_unit,
        calc_cost: n.quantity_sold * n.cogs_per_unit
    })));

    console.log("Sales (Products):");
    console.table(s?.map(n => ({
        product: n.products?.product_name,
        qty: n.quantity,
        sale: n.sale_amount,
        gp: n.gross_profit,
        cogs_unit: n.cogs_per_unit,
        calc_cost: n.quantity * n.cogs_per_unit
    })));
}

check();

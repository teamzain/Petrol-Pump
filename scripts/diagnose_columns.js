const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://lpiaqgvryyccfrwtdnpb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaWFxZ3ZyeXljY2Zyd3RkbnBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTA4MTYsImV4cCI6MjA4NjIyNjgxNn0.nMw2RYKYq3mJ2eTdyTeoquFFbkXRcYbyN7wkXaRejUw";

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
    console.log("Diagnosing 'nozzle_readings' table columns...");

    // Get a valid nozzle ID first
    const { data: nozzles } = await supabase.from('nozzles').select('id').limit(1);
    const nozzleId = nozzles?.[0]?.id;

    if (!nozzleId) {
        console.error("No nozzles found. Cannot test insert.");
        return;
    }

    const basePayload = {
        nozzle_id: nozzleId,
        reading_date: '2099-01-01', // Future date to identify test data
        opening_reading: 0,
        closing_reading: 10,
        // Missing "quantity" field intentionally
    };

    // Test 1: liters_dispensed
    console.log("Test 1: Trying 'liters_dispensed'...");
    const { error: error1 } = await supabase.from('nozzle_readings').insert({
        ...basePayload,
        liters_dispensed: 10,
        sales_amount: 100 // assuming sales_amount
    });

    if (error1) {
        console.log("Test 1 Failed:", error1.message);
    } else {
        console.log("Test 1 SUCCESS! Column is 'liters_dispensed'.");
    }

    // Test 2: quantity_sold
    console.log("Test 2: Trying 'quantity_sold'...");
    const { error: error2 } = await supabase.from('nozzle_readings').insert({
        ...basePayload,
        quantity_sold: 10,
        sale_amount: 100, // assuming sale_amount paired with quantity_sold
        selling_price: 10,
        cogs_per_unit: 0,
        total_cogs: 0,
        gross_profit: 0
    });

    if (error2) {
        console.log("Test 2 Failed:", error2.message);
    } else {
        console.log("Test 2 SUCCESS! Column is 'quantity_sold'.");
    }
}

diagnose();

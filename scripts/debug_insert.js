const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://lpiaqgvryyccfrwtdnpb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaWFxZ3ZyeXljY2Zyd3RkbnBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTA4MTYsImV4cCI6MjA4NjIyNjgxNn0.nMw2RYKYq3mJ2eTdyTeoquFFbkXRcYbyN7wkXaRejUw";

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
    console.log("Attempting to insert dummy reading...");

    // First get a valid nozzle ID
    const { data: nozzles } = await supabase.from('nozzles').select('id').limit(1);

    if (!nozzles || nozzles.length === 0) {
        console.error("No nozzles found to test with.");
        return;
    }

    const nozzleId = nozzles[0].id;
    const testDate = new Date().toISOString().split('T')[0];

    const payload = {
        nozzle_id: nozzleId,
        reading_date: testDate,
        opening_reading: 1000,
        closing_reading: 1050,
        liters_dispensed: 50,
        sales_amount: 5000,
        status: 'completed'
    };

    const { data, error } = await supabase
        .from('nozzle_readings')
        .insert([payload])
        .select();

    if (error) {
        console.error("INSERT FAILED:", error.message, error.details, error.hint);
    } else {
        console.log("INSERT SUCCESS:", data);
        // Clean up? No, let's keep it to see if it shows up in UI.
    }
}

testInsert();

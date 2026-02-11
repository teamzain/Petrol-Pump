const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://lpiaqgvryyccfrwtdnpb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaWFxZ3ZyeXljY2Zyd3RkbnBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTA4MTYsImV4cCI6MjA4NjIyNjgxNn0.nMw2RYKYq3mJ2eTdyTeoquFFbkXRcYbyN7wkXaRejUw";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Checking nozzle_readings columns...");

    const { data, error } = await supabase
        .from("nozzle_readings")
        .select("*")
        .limit(1);

    if (error) {
        console.error("Error:", error.message);
    } else if (data && data.length > 0) {
        console.log("Columns:", Object.keys(data[0]));
    } else {
        console.log("No data available to determine columns.");
    }
}

check();

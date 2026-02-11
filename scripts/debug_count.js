const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://lpiaqgvryyccfrwtdnpb.supabase.co"; // From .env.local view
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaWFxZ3ZyeXljY2Zyd3RkbnBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTA4MTYsImV4cCI6MjA4NjIyNjgxNn0.nMw2RYKYq3mJ2eTdyTeoquFFbkXRcYbyN7wkXaRejUw"; // From .env.local view

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Checking row counts with ANON key...");

    const { count, error } = await supabase
        .from("nozzle_readings")
        .select("*", { count: "exact", head: true });

    if (error) {
        console.error("Error:", error.message);
    } else {
        console.log("Nozzle Readings Count:", count);
    }
}

check();

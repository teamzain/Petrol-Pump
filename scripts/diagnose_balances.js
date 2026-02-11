
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
    console.log("🔍 Diagnosing daily_balances table...");

    const { data, error } = await supabase
        .from('daily_balances')
        .select('*')
        .limit(1);

    if (error) {
        console.error("❌ Error fetching daily_balances:", error);
    } else if (data && data.length > 0) {
        console.log("✅ Columns found in daily_balances:", Object.keys(data[0]).join(", "));
    } else {
        console.log("⚠️ Table is empty, cannot detect columns via select.");
        // Try to insert a dummy to see if it works with those columns
        const { error: insertError } = await supabase
            .from('daily_balances')
            .update({ closed_at: new Date().toISOString() })
            .eq('id', '00000000-0000-0000-0000-000000000000');

        if (insertError && insertError.message.includes('column "closed_at" of relation "daily_balances" does not exist')) {
            console.log("❌ CONFIRMED: Column 'closed_at' DOES NOT exist.");
        } else {
            console.log("✅ Column 'closed_at' might exist or update skipped.");
        }
    }
}

diagnose();

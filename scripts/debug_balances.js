const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkBalances() {
    const { data, error } = await supabase
        .from('daily_balances')
        .select('*')
        .order('balance_date', { ascending: false })
        .limit(5)

    if (error) {
        console.error('Error:', error)
        return
    }

    console.log('Recent Balances:', JSON.stringify(data, null, 2))
}

checkBalances()

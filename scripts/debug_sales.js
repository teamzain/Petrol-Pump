
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://lpiaqgvryyccfrwtdnpb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaWFxZ3ZyeXljY2Zyd3RkbnBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTA4MTYsImV4cCI6MjA4NjIyNjgxNn0.nMw2RYKYq3mJ2eTdyTeoquFFbkXRcYbyN7wkXaRejUw';
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugSale() {
    console.log('Fetching all products...');
    const { data: products, error: pError } = await supabase.from('products').select('*');
    if (pError) {
        console.error('Fetch products error:', pError);
        return;
    }
    console.log('Total Products found:', products.length);
    products.forEach(p => console.log(`- ${p.product_name} (${p.product_type}), ID: ${p.id}`));

    const lubricant = products.find(p => p.product_type !== 'fuel');
    if (!lubricant) {
        console.error('No non-fuel product found.');
    } else {
        console.log('Testing Lubricant Sale Insert with:', lubricant.product_name);
        const saleData = {
            sale_date: new Date().toISOString().split('T')[0],
            product_id: lubricant.id,
            quantity: 1,
            selling_price: lubricant.selling_price,
            sale_amount: lubricant.selling_price,
            sale_type: 'product',
            payment_method: 'cash',
            cogs_per_unit: lubricant.weighted_avg_cost || 0,
            total_cogs: lubricant.weighted_avg_cost || 0,
            gross_profit: lubricant.selling_price - (lubricant.weighted_avg_cost || 0)
        };
        const { error } = await supabase.from('sales').insert(saleData);
        if (error) console.error('Lubricant Sale Error:', error);
        else console.log('Lubricant Sale Success!');
    }

    const fuel = products.find(p => p.product_type === 'fuel');
    if (fuel) {
        console.log('Testing Fuel Sale (Nozzle Reading) Insert for:', fuel.product_name);
        // Find a nozzle for this fuel
        const { data: nozzle } = await supabase.from('nozzles').select('*').eq('product_id', fuel.id).limit(1).single();
        if (nozzle) {
            const readingData = {
                nozzle_id: nozzle.id,
                reading_date: new Date().toISOString().split('T')[0],
                opening_reading: nozzle.current_reading,
                closing_reading: nozzle.current_reading + 1,
                quantity_sold: 1,
                selling_price: fuel.selling_price,
                sale_amount: fuel.selling_price,
                payment_method: 'cash',
                cogs_per_unit: fuel.weighted_avg_cost || 0,
                total_cogs: fuel.weighted_avg_cost || 0,
                gross_profit: fuel.selling_price - (fuel.weighted_avg_cost || 0)
            };
            const { error: rError } = await supabase.from('nozzle_readings').insert(readingData);
            if (rError) console.error('Fuel Sale Reading Error:', rError);
            else console.log('Fuel Sale Reading Success!');
        }
    }
}

debugSale();

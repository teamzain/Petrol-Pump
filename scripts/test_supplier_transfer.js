const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Manually parse .env.local
try {
    const envPath = path.resolve(__dirname, "../.env.local");
    const envFile = fs.readFileSync(envPath, "utf8");

    envFile.split("\n").forEach(line => {
        const [key, value] = line.split("=");
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
} catch (e) {
    console.error("Failed to read .env.local:", e.message);
    process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verifyFix() {
    console.log("--- Verifying Supplier Transfer Fix ---");

    try {
        // 1. Get a Bank Account
        const { data: accounts, error: accError } = await supabase
            .from("accounts")
            .select("id, account_name, current_balance")
            .eq("account_type", "bank")
            .eq("status", "active")
            .limit(1);

        if (accError || !accounts.length) {
            throw new Error("No active bank account found for testing: " + (accError?.message || "empty"));
        }
        const bank = accounts[0];
        console.log(`Using Bank: ${bank.account_name} (Current Balance: ${bank.current_balance})`);

        // 2. Get a Supplier
        const { data: suppliers, error: suppError } = await supabase
            .from("suppliers")
            .select("id, supplier_name, account_balance")
            .eq("status", "active")
            .limit(1);

        if (suppError || !suppliers.length) {
            throw new Error("No active supplier found for testing: " + (suppError?.message || "empty"));
        }
        const supplier = suppliers[0];
        console.log(`Using Supplier: ${supplier.supplier_name} (Current Balance: ${supplier.account_balance})`);

        const testAmount = 10;
        console.log(`Simulating transfer of Rs. ${testAmount}...`);

        // 3. Record Transaction
        // Note: In real app, we'd use service role for some things, but transactions table should be accessible
        const { data: tx, error: txError } = await supabase.from("transactions").insert({
            transaction_date: new Date().toISOString(),
            transaction_type: 'transfer',
            category: 'supplier_transfer',
            description: 'VERIFICATION TEST: Supplier Transfer Deduction',
            amount: testAmount,
            from_account: bank.id,
            to_account: null,
            reference_type: 'supplier',
            reference_id: supplier.id
        }).select().single();

        if (txError) throw txError;
        console.log("Transaction recorded. Transaction ID:", tx.id);

        // 4. Manually call increment_supplier_balance (mimicking frontend)
        // Note: The RPC might need higher permissions, but let's try.
        const { error: rpcError } = await supabase.rpc('increment_supplier_balance', {
            p_supplier_id: supplier.id,
            p_amount: testAmount
        });

        if (rpcError) {
            console.warn("RPC increment_supplier_balance failed (permissions?), performing manual update for supplier balance...");
            const { error: manualSuppError } = await supabase
                .from("suppliers")
                .update({ account_balance: Number(supplier.account_balance) + testAmount })
                .eq("id", supplier.id);
            if (manualSuppError) console.error("Manual supplier update failed too:", manualSuppError);
        }

        // 5. Wait a moment for trigger to finish (triggers are usually immediate but good to wait a sec)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 6. Verify Bank Balance
        const { data: updatedBank } = await supabase.from("accounts").select("current_balance").eq("id", bank.id).single();
        console.log(`Bank Balance After: ${updatedBank.current_balance}`);

        const expectedBankBal = Number(bank.current_balance) - testAmount;
        if (Math.abs(updatedBank.current_balance - expectedBankBal) < 0.01) {
            console.log("✅ SUCCESS: Bank balance correctly deducted!");
        } else {
            console.error(`❌ FAILURE: Bank balance was NOT correctly deducted. Expected ${expectedBankBal}, got ${updatedBank.current_balance}`);
        }

        // 7. Verify Supplier Balance
        const { data: updatedSupp } = await supabase.from("suppliers").select("account_balance").eq("id", supplier.id).single();
        console.log(`Supplier Balance After: ${updatedSupp.account_balance}`);

        const expectedSuppBal = Number(supplier.account_balance) + testAmount;
        if (Math.abs(updatedSupp.account_balance - expectedSuppBal) < 0.01) {
            console.log("✅ SUCCESS: Supplier balance correctly increased!");
        } else {
            console.error(`❌ FAILURE: Supplier balance was NOT correctly increased. Expected ${expectedSuppBal}, got ${updatedSupp.account_balance}`);
        }

        // CLEANUP
        console.log("Cleaning up test transaction...");
        // Revert bank balance manually to be safe
        await supabase.from("accounts").update({ current_balance: bank.current_balance }).eq("id", bank.id);
        await supabase.from("suppliers").update({ account_balance: supplier.account_balance }).eq("id", supplier.id);
        await supabase.from("transactions").delete().eq("id", tx.id);
        console.log("Cleanup complete.");

    } catch (err) {
        console.error("Verification failed:", err.message);
    }
}

verifyFix();

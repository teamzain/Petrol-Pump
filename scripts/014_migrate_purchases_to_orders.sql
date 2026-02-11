-- Migrate existing purchases to the new purchase_orders table
DO $$
DECLARE
    p_record RECORD;
    v_order_id UUID;
BEGIN
    -- Loop through unique invoice numbers in purchases
    FOR p_record IN 
        SELECT DISTINCT invoice_number, supplier_id, purchase_date, payment_method, notes, created_at
        FROM public.purchases 
        WHERE order_id IS NULL
    LOOP
        -- Calculate total amount for this invoice
        DECLARE
            v_total DECIMAL(15, 2);
        BEGIN
            SELECT SUM(total_amount) INTO v_total 
            FROM public.purchases 
            WHERE invoice_number = p_record.invoice_number;

            -- Insert the "Master" order
            INSERT INTO public.purchase_orders (
                purchase_date,
                supplier_id,
                invoice_number,
                total_amount,
                paid_amount,
                due_amount,
                payment_method,
                status,
                notes,
                created_at
            ) VALUES (
                p_record.purchase_date,
                p_record.supplier_id,
                p_record.invoice_number,
                v_total,
                v_total, -- Assume existing historical purchases are fully paid
                0,
                p_record.payment_method,
                'completed',
                p_record.notes,
                -- created_by not available in old purchases table
                p_record.created_at
            ) RETURNING id INTO v_order_id;

            -- Update the "Detail" items to link to this order
            UPDATE public.purchases 
            SET order_id = v_order_id 
            WHERE invoice_number = p_record.invoice_number;
        END;
    END LOOP;
END $$;

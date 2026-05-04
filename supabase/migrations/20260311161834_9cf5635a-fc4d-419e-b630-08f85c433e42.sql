UPDATE copilot_training SET content = 'SALES PRICING & FACTORY REBATES

CRITICAL: All equipment prices are PRE-CALCULATED and stored directly in the database. NEVER calculate prices yourself. Use the exact values returned by the lookup_equipment tool or shown in the EQUIPMENT MATCHUPS context.

Price fields from the database:
- pay_in_full = factory_rebate_price column (the cash/check/CC price)
- financed = total_price column (the 0% financing price)
- monthly_36 = total_price / 36

Customers choose ONE of two payment options (mutually exclusive):

OPTION A — 0% Financing for 36 Months:
- Price = financed (from tool result)
- Monthly payment = monthly_36 (from tool result)
- No factory rebate applied
- 0% APR, 36 equal payments

OPTION B — Pay in Full & Save (Factory Rebate):
- Price = pay_in_full (from tool result)
- Cash, check, or credit card accepted
- Factory rebate is already subtracted in this price

REBATE STACKING:
- CPS Energy Rebates (early_rebate / burnout_rebate) ALWAYS apply regardless of payment option
- Public Servant Discount ($250) ALWAYS applies regardless of payment option
- Factory Rebate is ONLY available with Option B (pay in full)
- Customers CANNOT get 0% financing AND the factory rebate — they must choose one

COLUMN LABELS:
- "Financed" = total_price (0% financing quote price, Option A)
- "Pay in Full" = factory_rebate_price (cash/check/CC price after factory rebate, Option B)

NEVER perform math on component_price, materials, labor, profit, or tax. The final prices are already computed and stored.', updated_at = now() WHERE id = '3c59a782-fe06-4ca5-8634-2c32272fad9b';
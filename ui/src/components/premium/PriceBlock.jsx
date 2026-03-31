/** PriceBlock — renders price for selected billing period.
 *  Switches between monthly ($39/mo) and yearly ($32/mo, billed $384/yr). */
export default function PriceBlock({ billingPeriod, monthlyPrice = 39, yearlyMonthlyPrice = 32, yearlyTotal = 384 }) {
  const isYearly = billingPeriod === 'yearly';
  const amount = isYearly ? yearlyMonthlyPrice : monthlyPrice;
  const caption = isYearly ? `billed $${yearlyTotal} / year` : 'cancel anytime';

  return (
    <div className="ngw-price-block">
      <div className="ngw-price-block__main">
        <span className="ngw-price-block__amount">${amount}</span>
        <span className="ngw-price-block__period">/ mo</span>
      </div>
      <div className="ngw-price-block__caption">{caption}</div>
    </div>
  );
}

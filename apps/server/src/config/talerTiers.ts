// Taler purchase tiers (docs/support-spec.md §3). Escalating bonus rewards
// larger support without punishing the $5 supporter — cap the bonus at +20%.
//
// paddlePriceId is filled from env once the products are created in the
// Paddle dashboard (sandbox first, then live). A tier with no price ID is
// simply not purchasable yet — the webhook rejects unknown price IDs loudly.

export interface TalerTier {
    usdCents: number;
    talers: number;
    bonusLabel: string | null;
    paddlePriceId: string | undefined;
}

export const TALER_TIERS: TalerTier[] = [
    { usdCents: 500,   talers: 500,    bonusLabel: null,    paddlePriceId: process.env.PADDLE_PRICE_ID_5 },
    { usdCents: 1000,  talers: 1050,   bonusLabel: '+5%',   paddlePriceId: process.env.PADDLE_PRICE_ID_10 },
    { usdCents: 2000,  talers: 2200,   bonusLabel: '+10%',  paddlePriceId: process.env.PADDLE_PRICE_ID_20 },
    { usdCents: 5000,  talers: 5750,   bonusLabel: '+15%',  paddlePriceId: process.env.PADDLE_PRICE_ID_50 },
    { usdCents: 10000, talers: 12000,  bonusLabel: '+20%',  paddlePriceId: process.env.PADDLE_PRICE_ID_100 },
];

export function tierForPriceId(priceId: string): TalerTier | undefined {
    return TALER_TIERS.find(t => t.paddlePriceId && t.paddlePriceId === priceId);
}

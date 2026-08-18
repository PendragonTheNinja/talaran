import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireTrusted } from '../lib/trust';
import { botCheckGate } from '../services/botCheck';
import { logger } from '../lib/logger';
import { notifyInventoryChanged } from '../services/inventory';
import { getGold } from '../services/gold';
import { getStorage, getCarried, depositItem, withdrawItem } from '../services/property';
import {
    SHOP_TOWN,
    getBuildInfo,
    startEstablishShop,
    shopsAtLocation,
    shopFront,
    myShop,
    setShopDetails,
    setShopOpen,
    createListing,
    setListingPrice,
    cancelListing,
    createBuyOrder,
    cancelBuyOrder,
    depositBuyFund,
    withdrawBuyFund,
    collectTill,
    shopHistory,
    unseenTrades,
    markTradesSeen,
    notifyOwnerOfTrade,
    buyFromShop,
    sellToShop,
} from '../services/shops';

const router = Router();

// Player Shops (docs/marketplace-spec.md §4).
//
// Presence is enforced in the service layer, not here, because the same rules
// apply however a call arrives. These handlers validate shapes and translate
// results into responses.

async function currentLocation(playerId: number): Promise<number | null> {
    const p = await db('players').where({ id: playerId }).select('current_location_id').first();
    return p?.current_location_id ?? null;
}

function asInt(raw: unknown): number | null {
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) ? n : null;
}

// ── Browse ──────────────────────────────────────────────────────────────────

/** The shopfronts standing where the player is. */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const locationId = await currentLocation(playerId);
        if (locationId === null) { res.status(404).json({ error: 'Player not found.' }); return; }

        res.json({
            gold: await getGold(playerId),
            shops: await shopsAtLocation(locationId),
            mine: await myShop(playerId),
            build: await getBuildInfo(playerId),
        });
    } catch (err) {
        logger.error(`Shops list error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Trading as a visitor ────────────────────────────────────────────────────

router.post('/buy', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const listingId = asInt(req.body?.listingId);
    const quantity = asInt(req.body?.quantity);
    try {
        if (listingId === null || quantity === null || quantity <= 0) {
            res.status(400).json({ error: 'Invalid request.' });
            return;
        }

        const result = await buyFromShop(playerId, listingId, quantity);
        if (!result.success) { res.status(400).json({ error: result.error }); return; }

        notifyInventoryChanged(playerId);
        // After the transaction, never inside it: a socket message sent from
        // within announces something a rollback would undo.
        if (result.shopId) void notifyOwnerOfTrade(result.shopId);
        res.json({ message: result.message, spent: result.spent, gold: await getGold(playerId) });
    } catch (err) {
        logger.error(`Shop buy error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/sell', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const orderId = asInt(req.body?.orderId);
    const quantity = asInt(req.body?.quantity);
    try {
        if (orderId === null || quantity === null || quantity <= 0) {
            res.status(400).json({ error: 'Invalid request.' });
            return;
        }

        const result = await sellToShop(playerId, orderId, quantity);
        if (!result.success) { res.status(400).json({ error: result.error }); return; }

        notifyInventoryChanged(playerId);
        if (result.shopId) void notifyOwnerOfTrade(result.shopId);
        res.json({ message: result.message, earned: result.earned, gold: await getGold(playerId) });
    } catch (err) {
        logger.error(`Shop sell error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Building one ────────────────────────────────────────────────────────────

// botCheckGate, same as every other timed action. Without it a shop build is a
// hole in the bot checking that nothing else has.
router.post('/build', requireAuth, requireTrusted, botCheckGate, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const result = await startEstablishShop(playerId);
        if (!result.ok) { res.status(400).json({ error: result.error }); return; }
        res.json({ message: `You begin raising a shopfront in ${SHOP_TOWN}.`, timerSeconds: result.timerSeconds });
    } catch (err) {
        logger.error(`Shop build error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Managing your own ───────────────────────────────────────────────────────

/** Just the badge number. Cheap enough to call whenever a location panel opens. */
router.get('/mine/unseen', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        res.json(await unseenTrades(playerId) ?? { count: 0, gold: 0 });
    } catch (err) {
        logger.error(`Shop unseen error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/mine/state', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        res.json({ gold: await getGold(playerId), mine: await myShop(playerId) });
    } catch (err) {
        logger.error(`My shop error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** Small helper: every owner action returns the same shape. */
async function respond(
    res: Response,
    playerId: number,
    result: { success: boolean; error?: string; message?: string },
) {
    if (!result.success) { res.status(400).json({ error: result.error }); return; }
    res.json({ message: result.message, gold: await getGold(playerId), mine: await myShop(playerId) });
}

router.post('/mine/details', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const { name, tagline, description } = req.body ?? {};
        await respond(res, playerId, await setShopDetails(
            playerId, String(name ?? ''), tagline ?? null, description ?? null,
        ));
    } catch (err) {
        logger.error(`Shop details error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/mine/open', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        await respond(res, playerId, await setShopOpen(playerId, Boolean(req.body?.open)));
    } catch (err) {
        logger.error(`Shop open error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/mine/listings', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const itemId = asInt(req.body?.itemId);
        const quantity = asInt(req.body?.quantity);
        const unitPrice = asInt(req.body?.unitPrice);
        if (itemId === null || quantity === null || unitPrice === null) {
            res.status(400).json({ error: 'Invalid request.' });
            return;
        }
        await respond(res, playerId, await createListing(playerId, itemId, quantity, unitPrice));
    } catch (err) {
        logger.error(`Shop listing error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/mine/listings/:listingId/price', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const listingId = asInt(req.params.listingId);
        const unitPrice = asInt(req.body?.unitPrice);
        if (listingId === null || unitPrice === null) { res.status(400).json({ error: 'Invalid request.' }); return; }
        await respond(res, playerId, await setListingPrice(playerId, listingId, unitPrice));
    } catch (err) {
        logger.error(`Shop reprice error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/mine/listings/:listingId', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const listingId = asInt(req.params.listingId);
        if (listingId === null) { res.status(400).json({ error: 'Invalid request.' }); return; }
        const quantity = req.body?.quantity === undefined ? undefined : asInt(req.body.quantity) ?? undefined;
        await respond(res, playerId, await cancelListing(playerId, listingId, quantity));
    } catch (err) {
        logger.error(`Shop unlist error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/mine/orders', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const itemId = asInt(req.body?.itemId);
        const quantity = asInt(req.body?.quantity);
        const unitPrice = asInt(req.body?.unitPrice);
        if (itemId === null || quantity === null || unitPrice === null) {
            res.status(400).json({ error: 'Invalid request.' });
            return;
        }
        await respond(res, playerId, await createBuyOrder(playerId, itemId, quantity, unitPrice));
    } catch (err) {
        logger.error(`Shop buy order error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/mine/orders/:orderId', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const orderId = asInt(req.params.orderId);
        if (orderId === null) { res.status(400).json({ error: 'Invalid request.' }); return; }
        await respond(res, playerId, await cancelBuyOrder(playerId, orderId));
    } catch (err) {
        logger.error(`Shop cancel order error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/mine/fund', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const amount = asInt(req.body?.amount);
        const direction = req.body?.direction;
        if (amount === null || (direction !== 'in' && direction !== 'out')) {
            res.status(400).json({ error: 'Invalid request.' });
            return;
        }
        await respond(res, playerId, direction === 'in'
            ? await depositBuyFund(playerId, amount)
            : await withdrawBuyFund(playerId, amount));
    } catch (err) {
        logger.error(`Shop fund error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Shop storage. Reuses the property service pointed at type='shop', so the back
// room behaves exactly like a homestead's and stays one implementation.
router.get('/mine/storage', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const [storage, carried] = await Promise.all([
            getStorage(playerId, 'shop'),
            getCarried(playerId),
        ]);
        res.json({ ...storage, carried });
    } catch (err) {
        logger.error(`Shop storage error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/mine/storage/deposit', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const r = await depositItem(playerId, asInt(req.body?.itemId) ?? 0, asInt(req.body?.quantity) ?? 0, 'shop');
    if (!r.success) { res.status(400).json({ error: r.error }); return; }
    notifyInventoryChanged(playerId);
    res.json({ ...r, mine: await myShop(playerId) });
});

router.post('/mine/storage/withdraw', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const r = await withdrawItem(playerId, asInt(req.body?.itemId) ?? 0, asInt(req.body?.quantity) ?? 0, 'shop');
    if (!r.success) { res.status(400).json({ error: r.error }); return; }
    notifyInventoryChanged(playerId);
    res.json({ ...r, mine: await myShop(playerId) });
});

router.get('/mine/history', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const history = await shopHistory(playerId);
        if (!history) { res.status(404).json({ error: 'You have no shop.' }); return; }
        // Reading the list is what marks it read.
        await markTradesSeen(playerId);
        res.json(history);
    } catch (err) {
        logger.error(`Shop history error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/mine/till', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        await respond(res, playerId, await collectTill(playerId));
    } catch (err) {
        logger.error(`Shop till error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── One shopfront ───────────────────────────────────────────────────────────
//
// LAST, deliberately. Express matches in registration order, so a '/:shopId'
// route declared above '/mine/state' swallows it: 'mine' arrives as the shopId,
// fails to parse, and every owner endpoint under it becomes unreachable.
router.get('/:shopId', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const shopId = asInt(req.params.shopId);
    try {
        if (shopId === null) { res.status(400).json({ error: 'Invalid shop.' }); return; }

        const front = await shopFront(shopId, playerId);
        if (!front) { res.status(404).json({ error: 'No such shop.' }); return; }

        // Visible only from where it stands. Hiding the link elsewhere is
        // decoration; this is the control.
        const locationId = await currentLocation(playerId);
        if (locationId !== front.locationId) {
            res.status(400).json({ error: 'You are not at that shop.' });
            return;
        }

        res.json({ gold: await getGold(playerId), shop: front });
    } catch (err) {
        logger.error(`Shopfront error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;

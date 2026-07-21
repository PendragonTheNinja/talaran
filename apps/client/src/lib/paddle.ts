// Paddle.js (Billing, v2) loader + overlay checkout. docs/support-spec.md §5.
//
// The client-side token is public by design (it can only open checkouts).
// Set VITE_PADDLE_CLIENT_TOKEN in apps/client/.env — a token starting with
// 'test_' automatically targets the sandbox environment.
//
// Credits NEVER come from this file: the checkout.completed event only tells
// the UI to start polling the balance. The server webhook is the sole source
// of Taler credits.

declare global {
    interface Window { Paddle?: any }
}

const PADDLE_SRC = 'https://cdn.paddle.com/paddle/v2/paddle.js'
const TOKEN: string | undefined = import.meta.env.VITE_PADDLE_CLIENT_TOKEN

let loadPromise: Promise<any> | null = null
let completedHandler: (() => void) | null = null

export function paddleConfigured(): boolean {
    return !!TOKEN
}

function loadPaddle(): Promise<any> {
    if (loadPromise) return loadPromise
    loadPromise = new Promise((resolve, reject) => {
        if (!TOKEN) { reject(new Error('Paddle is not configured.')); return }
        const script = document.createElement('script')
        script.src = PADDLE_SRC
        script.async = true
        script.onload = () => {
            const Paddle = window.Paddle
            if (!Paddle) { reject(new Error('Paddle failed to load.')); return }
            if (TOKEN.startsWith('test_')) Paddle.Environment.set('sandbox')
            Paddle.Initialize({
                token: TOKEN,
                eventCallback: (event: { name?: string }) => {
                    if (event?.name === 'checkout.completed') completedHandler?.()
                },
            })
            resolve(Paddle)
        }
        script.onerror = () => reject(new Error('Could not load the payment library.'))
        document.head.appendChild(script)
    })
    return loadPromise
}

/** Open the overlay checkout for one tier. onCompleted fires when Paddle
 *  reports the checkout finished — the webhook does the actual crediting. */
export async function openTalerCheckout(priceId: string, playerId: number, onCompleted: () => void) {
    const Paddle = await loadPaddle()
    completedHandler = onCompleted
    Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customData: { playerId: String(playerId) },
        settings: {
            displayMode: 'overlay',
            theme: 'dark',
            showAddDiscounts: false,
        },
    })
}

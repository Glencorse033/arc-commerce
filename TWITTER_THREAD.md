# Honest Twitter Thread: Arc Commerce x Circle Dev Experience

## Hook / Thread Start
1/ Just spent the morning integrating Arc Commerce with Circle's Developer Controlled Wallets. Here’s an honest look at the DX, the "aha" moments, and where the friction is. 🧵👇

## Setup & Prerequisites
2/ First impression: The stack is solid (Next.js, Supabase, Circle). Node 22+ requirement is reasonable. One minor friction point: needing a global Supabase CLI or relying on `npx` for migrations on Windows can be a bit tricky with execution policies.

## The "Aha!" Moment
3/ The "Aha!" moment? Seeing the Admin Wallet automatically initialize, but wait—there's more. Integrating existing developer-controlled wallets as a "primary" payment method alongside MetaMask. Seeing user balances from both systems in one UI is the real UX win here. 🛡️

## Friction Points
4/ Real-world friction: The Entity Secret registration process. Generating the ciphertext manually or through a script is a hurdle that could be smoother. Once you’re through, it’s powerful, but that first link is the toughest.

## Integration Velocity
5/ Velocity: Once the env is set, it's fast. `arc-commerce` does a great job of abstracting the payment flow. Integrating USDC as a payment method for credits feels like a Saturday project, not a month-long sprint. 🚀

## Conclusion
6/ Final verdict: Arc is making Web3 commerce feel like Web2 API integration. Still some "crypto-native" hurdles in the setup, but the end-user experience (USDC payments) is as smooth as Stripe.

@circlefin @Arc_Testnet #Web3 #BuildOnArc #CircleSDK

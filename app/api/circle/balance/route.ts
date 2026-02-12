/**
 * Copyright 2025 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from "@/lib/supabase/server";
import { circleDeveloperSdk } from "@/lib/circle/developer-controlled-wallets-client";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const walletId = searchParams.get("walletId");

        if (!walletId) {
            return NextResponse.json({ error: "walletId is required" }, { status: 400 });
        }

        const supabase = await createClient();
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const response = await circleDeveloperSdk.getWalletTokenBalance({
            id: walletId,
        });

        console.log(`[DEBUG] Wallet ${walletId} balances:`, JSON.stringify(response.data?.tokenBalances, null, 2));

        const usdcTokenId = process.env.CIRCLE_USDC_TOKEN_ID;

        // Find the USDC balance in the token balances
        const usdcBalance = response.data?.tokenBalances?.find(
            (tb) => tb.token?.id === usdcTokenId
        );

        if (!usdcBalance) {
            console.warn(`[DEBUG] Configured USDC Token ID ${usdcTokenId} not found in wallet balances.`);
        }

        return NextResponse.json({
            balance: usdcBalance?.amount || "0",
            rawBalance: usdcBalance || null,
        });
    } catch (error: any) {
        console.error("Error fetching Circle wallet balance:", error);
        return NextResponse.json(
            { error: error.message || "Failed to fetch balance" },
            { status: 500 }
        );
    }
}

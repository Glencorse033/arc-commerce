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

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { circleDeveloperSdk } from "@/lib/circle/developer-controlled-wallets-client";
import { supabaseAdminClient } from "@/lib/supabase/admin-client";
import { Blockchain } from "@circle-fin/developer-controlled-wallets";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { credits, usdcAmount } = await req.json();

    if (!credits || !usdcAmount) {
      return NextResponse.json(
        { error: "credits and usdcAmount are required" },
        { status: 400 }
      );
    }

    // 1. Fetch user's Circle wallet from the shared wallets table
    // Try to find an SCA wallet first (case-insensitive)
    let { data: userWallet, error: walletError } = await supabaseAdminClient
      .from("wallets")
      .select("circle_wallet_id, blockchain, address, type")
      .eq("user_id", user.id)
      .ilike("type", "sca")
      .limit(1)
      .single();

    // Fallback: If no SCA wallet found, just take the most recent wallet
    if (walletError || !userWallet) {
      const { data: fallbackWallet, error: fallbackError } = await supabaseAdminClient
        .from("wallets")
        .select("circle_wallet_id, blockchain, address, type")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (fallbackError || !fallbackWallet) {
        return NextResponse.json(
          { error: "Circle Developer Wallet not found. Please create one in the Wallet Demo first." },
          { status: 404 }
        );
      }
      userWallet = fallbackWallet;
    }

    // 2. Fetch the platform admin wallet to receive the USDC
    const { data: adminWallet, error: adminError } = await supabaseAdminClient
      .from("admin_wallets")
      .select("circle_wallet_id, address, chain")
      .eq("label", "Primary wallet")
      .single();

    if (adminError || !adminWallet) {
      return NextResponse.json(
        { error: "Platform admin wallet not configured" },
        { status: 500 }
      );
    }

    // 3. Prepare the transfer via Circle SDK
    const blockchain = userWallet.blockchain as Blockchain;

    // Fetch current balances to get the correct decimals for the token
    const balancesResponse = await circleDeveloperSdk.getWalletTokenBalance({
      id: userWallet.circle_wallet_id,
    });

    const usdcTokenId = process.env.CIRCLE_USDC_TOKEN_ID;
    const usdcToken = balancesResponse.data?.tokenBalances?.find(
      (tb) => tb.token?.id === usdcTokenId
    );

    if (!usdcToken) {
      console.error(`[CRITICAL] USDC with Token ID ${usdcTokenId} not found in wallet ${userWallet.circle_wallet_id}`);
      return NextResponse.json(
        { error: "USDC balance not found in wallet." },
        { status: 400 }
      );
    }

    const decimals = usdcToken.token?.decimals ?? 6;
    const amountNum = typeof usdcAmount === 'string' ? parseFloat(usdcAmount) : usdcAmount;

    // Robust BigInt conversion for any decimal count
    // Multiply by 10^decimals to get atoms
    // Using a safer approach: Parse as float, fix to max decimals, remove dot, pad with zeros
    const amountInSmallestUnit = (BigInt(Math.floor(amountNum * 100)) * BigInt(10) ** BigInt(decimals - 2)).toString();

    console.log(`[DEBUG] Payment Execution:`);
    console.log(`- User Wallet ID: ${userWallet.circle_wallet_id}`);
    console.log(`- Token ID: ${usdcTokenId} (${usdcToken.token?.symbol})`);
    console.log(`- Decimals: ${decimals}`);
    console.log(`- Amount (atoms): ${amountInSmallestUnit}`);
    console.log(`- From: ${userWallet.address}`);
    console.log(`- To: ${adminWallet.address}`);

    const transactionResponse = await circleDeveloperSdk.createTransaction({
      walletId: userWallet.circle_wallet_id,
      destinationAddress: adminWallet.address,
      amount: [amountInSmallestUnit], // The SDK type for SCA transfers expects an array
      fee: {
        type: "level",
        config: {
          feeLevel: "MEDIUM",
        },
      },
      tokenId: usdcTokenId as string,
    });

    if (!transactionResponse.data?.id) {
      throw new Error("Failed to initiate Circle transaction");
    }

    const circleTransactionId = transactionResponse.data.id;

    // 4. Record the transaction in Supabase
    const { data: transaction, error: insertError } = await supabaseAdminClient
      .from("transactions")
      .insert({
        user_id: user.id,
        wallet_id: userWallet.circle_wallet_id,
        direction: "credit",
        amount_usdc: usdcAmount,
        credit_amount: credits,
        exchange_rate: 1.0, // 1 USDC = 1 Credit
        chain: blockchain,
        asset: "USDC",
        tx_hash: "pending", // Will be updated by webhook
        status: "pending",
        idempotency_key: `client:${circleTransactionId}`,
        metadata: {
          payment_method: "circle_developer_wallet",
          circle_transaction_id: circleTransactionId,
        },
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to record transaction:", insertError);
      // We still return success since the Circle transaction was initiated
    }

    return NextResponse.json({
      success: true,
      transactionId: transaction?.id || circleTransactionId,
      circleTransactionId,
    });
  } catch (error: any) {
    console.error("Circle payment error:", error);
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

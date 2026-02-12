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
import { supabaseAdminClient } from "@/lib/supabase/admin-client";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const supabase = await createClient();
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Fetch the user's Circle wallets from the shared wallets table
        // We use the admin client because the wallets table might have strict RLS 
        // that prevents the user from seeing their own wallets if not configured correctly 
        // across both apps. Using admin client ensures we can show them their wallet.
        const { data: wallets, error: walletError } = await supabaseAdminClient
            .from("wallets")
            .select("id, circle_wallet_id, blockchain, address, type, name")
            .eq("user_id", user.id);

        if (walletError) {
            throw walletError;
        }

        return NextResponse.json({ wallets: wallets || [] });
    } catch (error: any) {
        console.error("Error fetching user wallets:", error);
        return NextResponse.json(
            { error: error.message || "Failed to fetch wallets" },
            { status: 500 }
        );
    }
}

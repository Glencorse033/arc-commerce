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

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function CircleWalletBalance() {
    const [wallets, setWallets] = useState<any[]>([]);
    const [balance, setBalance] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchWallets() {
            try {
                setIsLoading(true);
                const response = await fetch('/api/user-wallets');
                const data = await response.json();
                if (response.ok && data.wallets?.length > 0) {
                    setWallets(data.wallets);
                    // Fetch balance for the first SCA wallet (case-insensitive)
                    const scaWallet = data.wallets.find((w: any) => w.type?.toLowerCase() === 'sca') || data.wallets[0];
                    fetchBalance(scaWallet.circle_wallet_id);
                } else if (response.ok) {
                    setError("No Circle wallet found");
                }
            } catch (err) {
                setError("Failed to fetch wallets");
            } finally {
                setIsLoading(false);
            }
        }

        async function fetchBalance(walletId: string) {
            try {
                const response = await fetch(`/api/circle/balance?walletId=${walletId}`);
                const data = await response.json();
                if (response.ok) {
                    setBalance(data.balance);
                } else {
                    setError(data.error);
                }
            } catch (err) {
                setError("Failed to fetch balance");
            }
        }

        fetchWallets();
    }, []);

    if (isLoading) {
        return <span className="text-muted-foreground animate-pulse">Checking Circle balance...</span>;
    }

    if (error) {
        return <span className="text-amber-600 text-xs">{error}</span>;
    }

    if (wallets.length === 0) {
        return null;
    }

    return (
        <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-[10px] py-0">DEV WALLET</Badge>
            <Button variant="outline" disabled size="sm">
                {balance ? parseFloat(balance).toFixed(2) : "0.00"} USDC
            </Button>
        </div>
    );
}

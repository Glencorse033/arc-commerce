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

import { useState, useMemo, useEffect } from "react";
import { useAccount, useChainId, useWriteContract } from "wagmi";
import { BaseError, erc20Abi } from "viem";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUsdcBalance } from "@/lib/wagmi/useUsdcBalance";
import { toast } from "sonner";
import Image from "next/image";
import Link from "next/link";
import { TransactionConfirmationModal } from "@/components/wallet/transaction-confirmation-modal";

const USDC_PER_CREDIT = 1;
const presetUsdcAmounts = [10, 25, 50, 100];

type WalletType = "external" | "circle";

export function PurchaseCreditsCard() {
  const { address: externalAddress, isConnected: isExternalConnected } = useAccount();
  const chainId = useChainId();
  const {
    usdcAddress,
    balance: externalBalance,
    hasBalance: hasExternalBalance,
    isLoading: isExternalBalanceLoading,
  } = useUsdcBalance();
  const { writeContractAsync } = useWriteContract();

  const [walletType, setWalletType] = useState<WalletType>("external");
  const [creditsToPurchase, setCreditsToPurchase] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<{
    id: string;
    credits: number;
    usdcAmount: number;
    txHash: string;
    chainId: number;
    status: "pending" | "confirmed" | "failed";
    createdAt: string;
    fee?: number;
  } | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Circle Wallet States
  const [circleWallets, setCircleWallets] = useState<any[]>([]);
  const [selectedCircleWalletId, setSelectedCircleWalletId] = useState<string | null>(null);
  const [circleBalance, setCircleBalance] = useState<string | null>(null);
  const [isCircleLoading, setIsCircleLoading] = useState(false);

  // State to hold the fetched destination address and its loading status
  const [destination, setDestination] = useState<`0x${string}` | undefined>();
  const [isLoadingDestination, setIsLoadingDestination] = useState(true);

  // Effect to fetch the destination address from our new API endpoint
  useEffect(() => {
    async function fetchDestinationWallet() {
      try {
        setIsLoadingDestination(true);
        const response = await fetch('/api/destination-wallet');
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch destination wallet");
        }
        if (data.address) {
          setDestination(data.address);
        } else {
          throw new Error("API did not return a valid address.");
        }
      } catch (error) {
        console.error(error);
        toast.error("Configuration Error", {
          description: error instanceof Error ? error.message : "Could not load the destination address.",
        });
      } finally {
        setIsLoadingDestination(false);
      }
    }

    async function fetchCircleWallets() {
      try {
        setIsCircleLoading(true);
        const response = await fetch('/api/user-wallets');
        const data = await response.json();
        if (response.ok && data.wallets?.length > 0) {
          setCircleWallets(data.wallets);
          // Auto-select the first SCA wallet if available (case-insensitive)
          const scaWallet = data.wallets.find((w: any) => w.type?.toLowerCase() === 'sca') || data.wallets[0];
          setSelectedCircleWalletId(scaWallet.circle_wallet_id);
          setWalletType("circle"); // Default to Circle if one exists
        }
      } catch (error) {
        console.error("Failed to fetch Circle wallets:", error);
      } finally {
        setIsCircleLoading(false);
      }
    }

    fetchDestinationWallet();
    fetchCircleWallets();
  }, []);

  // Fetch balance when selected Circle wallet changes
  useEffect(() => {
    async function fetchBalance() {
      if (!selectedCircleWalletId) return;
      try {
        const response = await fetch(`/api/circle/balance?walletId=${selectedCircleWalletId}`);
        const data = await response.json();
        if (response.ok) {
          setCircleBalance(data.balance);
        }
      } catch (error) {
        console.error("Failed to fetch Circle balance:", error);
      }
    }
    if (walletType === "circle") {
      fetchBalance();
    }
  }, [selectedCircleWalletId, walletType]);

  const requiredUsdc = creditsToPurchase * USDC_PER_CREDIT;
  const requiredUsdcMicro = useMemo(() => {
    // Convert to 6‑decimal integer (avoid FP drift)
    const micro = Math.round(requiredUsdc * 1_000_000);
    return BigInt(micro);
  }, [requiredUsdc]);

  const hasSufficientBalance = useMemo(() => {
    if (walletType === "external") {
      return hasExternalBalance && externalBalance !== null
        ? externalBalance >= requiredUsdcMicro
        : false;
    } else {
      return circleBalance ? parseFloat(circleBalance) >= requiredUsdc : false;
    }
  }, [walletType, hasExternalBalance, externalBalance, circleBalance, requiredUsdc, requiredUsdcMicro]);

  const isConnected = walletType === "external" ? isExternalConnected : !!selectedCircleWalletId;

  const buttonDisabled =
    !isConnected ||
    !hasSufficientBalance ||
    creditsToPurchase <= 0 ||
    !destination ||
    (walletType === "external" && !usdcAddress) ||
    isSubmitting ||
    (walletType === "external" && isExternalBalanceLoading);

  async function handleExternalPurchase() {
    if (!isExternalConnected || !externalAddress) {
      toast.error("Not connected", {
        description: "Connect your wallet first.",
      });
      return;
    }
    if (!destination) {
      toast.error("Configuration error", {
        description: "Destination address missing.",
      });
      return;
    }
    if (!usdcAddress) {
      toast.error("Unsupported network", {
        description: "USDC not supported on current chain.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Prompt wallet (MetaMask/etc) for ERC20 transfer
      const txHash = await writeContractAsync({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "transfer",
        args: [destination, requiredUsdcMicro],
      });

      toast.success("Transaction submitted", {
        description: `Hash: ${txHash.slice(0, 10)}...`,
      });

      // Persist
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credits: creditsToPurchase,
          usdcAmount: requiredUsdc,
          txHash,
          chainId,
          walletAddress: externalAddress,
          destinationAddress: destination,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error("Recording failed", {
          description: j.error || "Could not record transaction.",
        });
      } else {
        const responseData = await res.json();
        setCurrentTransaction({
          id: responseData.transactionId || txHash,
          credits: creditsToPurchase,
          usdcAmount: requiredUsdc,
          txHash,
          chainId,
          status: "pending",
          createdAt: new Date().toISOString(),
        });
        setShowConfirmation(true);
      }
    } catch (err) {
      const message = err instanceof BaseError ? err.shortMessage : "Transaction failed unexpectedly.";
      toast.error("Transaction error", { description: message });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCirclePurchase() {
    if (!selectedCircleWalletId) {
      toast.error("No Circle wallet selected");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/circle/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credits: creditsToPurchase,
          usdcAmount: requiredUsdc,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to process Circle payment");
      }

      toast.success("Circle payment initiated!", {
        description: "Your credits will be added once the transaction is confirmed.",
      });

      setCurrentTransaction({
        id: data.transactionId,
        credits: creditsToPurchase,
        usdcAmount: requiredUsdc,
        txHash: "pending",
        chainId: chainId,
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      setShowConfirmation(true);
    } catch (error: any) {
      toast.error("Payment failed", { description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleRetry = () => {
    setShowConfirmation(false);
    setCurrentTransaction(null);
  };

  const handleCloseConfirmation = () => {
    setShowConfirmation(false);
    setCurrentTransaction(null);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Purchase Credits</CardTitle>
              <CardDescription>
                Top up your account balance using USDC.
              </CardDescription>
            </div>
            {circleWallets.length > 0 && (
              <div className="flex bg-muted p-1 rounded-md text-xs">
                <button
                  className={`px-2 py-1 rounded-sm transition-colors ${walletType === "external" ? "bg-background shadow-sm" : "hover:bg-background/50"
                    }`}
                  onClick={() => setWalletType("external")}
                >
                  MetaMask
                </button>
                <button
                  className={`px-2 py-1 rounded-sm transition-colors ${walletType === "circle" ? "bg-background shadow-sm" : "hover:bg-background/50"
                    }`}
                  onClick={() => setWalletType("circle")}
                >
                  Circle Wallet
                </button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          <div className="space-y-2">
            <Label htmlFor="credits-amount">Amount of Credits</Label>
            <Input
              id="credits-amount"
              type="number"
              value={creditsToPurchase}
              onChange={(e) =>
                setCreditsToPurchase(Math.max(0, Number(e.target.value)))
              }
              min="1"
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {presetUsdcAmounts.map((amount) => {
              const credits = amount / USDC_PER_CREDIT;
              const isActive = creditsToPurchase === credits;
              return (
                <Button
                  key={amount}
                  variant={isActive ? "secondary" : "outline"}
                  onClick={() => setCreditsToPurchase(credits)}
                  disabled={isSubmitting}
                >
                  ${amount}
                </Button>
              );
            })}
          </div>

          <div className="text-xs space-y-1">
            <div className="text-center text-muted-foreground p-2 rounded-md bg-muted/50">
              You will pay{" "}
              <span className="font-bold text-foreground">
                {requiredUsdc.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                USDC
              </span>
            </div>

            {walletType === "circle" ? (
              <div className="text-center text-xs pt-1">
                {isCircleLoading ? (
                  "Loading Circle balance..."
                ) : circleBalance !== null ? (
                  <>
                    Balance: <span className="font-semibold">{parseFloat(circleBalance).toFixed(2)} USDC</span>
                    {parseFloat(circleBalance) < requiredUsdc && (
                      <div className="text-amber-600">Insufficient Circle wallet balance.</div>
                    )}
                  </>
                ) : (
                  <div className="text-amber-600">Could not load Circle wallet balance.</div>
                )}
              </div>
            ) : (
              <>
                {!hasSufficientBalance && isExternalConnected && !isExternalBalanceLoading && (
                  <div className="text-amber-600 text-center pt-2">
                    Insufficient MetaMask balance.
                  </div>
                )}
              </>
            )}

            {isLoadingDestination && (
              <div className="text-red-500 text-center pt-2">
                Destination address not configured.
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-center gap-3">
          <Button
            className="w-full gap-2"
            onClick={walletType === "external" ? handleExternalPurchase : handleCirclePurchase}
            disabled={buttonDisabled}
          >
            <Image
              src="/usdc-logo.svg"
              alt="USDC Logo"
              width={20}
              height={20}
            />
            {isSubmitting ? "Processing..." : `Pay with ${walletType === "external" ? "MetaMask" : "Circle Wallet"}`}
          </Button>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">
              Powered by{" "}
              <Link
                className="underline font-bold"
                href="https://www.circle.com"
                target="_blank"
              >
                Circle
              </Link>
            </p>
          </div>
        </CardFooter>
      </Card>

      <TransactionConfirmationModal
        isOpen={showConfirmation}
        onClose={handleCloseConfirmation}
        transaction={currentTransaction}
        onRetry={handleRetry}
      />
    </>
  );
}

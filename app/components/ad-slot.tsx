"use client";
/* eslint-disable @next/next/no-img-element */

import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";

type NativeAd = {
  id: string;
  advertiserName: string;
  headline: string;
  body: string;
  imageUrl: string;
  destinationUrl: string;
  disclosure: "Sponsored";
};

export function AdSlot({ placement = "feed" }: { placement?: "feed" | "explore" | "profile" }) {
  const [ad, setAd] = useState<NativeAd | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/ads?placement=${placement}`).then((response) => response.json()).then((payload) => {
      if (!active || !payload.ad) return;
      setAd(payload.ad);
      void fetch("/api/ads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaignId: payload.ad.id, placement }) });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [placement]);
  if (!ad) return null;
  return <a className="native-ad" href={ad.destinationUrl} target="_blank" rel="noreferrer sponsored"><div>{ad.imageUrl ? <img src={ad.imageUrl} alt="" /> : <span>{ad.advertiserName.slice(0, 1)}</span>}</div><section><small>{ad.disclosure} · {ad.advertiserName}</small><strong>{ad.headline}</strong>{ad.body && <p>{ad.body}</p>}</section><ArrowUpRight size={18} /></a>;
}

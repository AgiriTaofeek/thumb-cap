import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { exchangeOAuthCode } from "../lib/api";

export default function OAuthCallback() {
  const nav = useNavigate();
  const [msg, setMsg] = useState("");

  useEffect(() => {
    async function run() {
      const u = new URL(window.location.href);
      const code = u.searchParams.get("code");
      if (!code) return;
      try {
        await exchangeOAuthCode(code, "default");
        setMsg("Connected");
        nav("/", { replace: true });
      } catch {
        setMsg("Failed to connect");
      }
    }
    run();
  }, [nav]);

  return (
    <div className="panel">
      <div className="panel__section">
        <div className="notice">{msg}</div>
      </div>
    </div>
  );
}

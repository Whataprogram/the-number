"use client";

import { AppConnect } from "@/components/Onboarding";

const NAMES: Record<string, string> = { venmo: "Venmo", cashapp: "Cash App", paypal: "PayPal", stripe: "Stripe" };

// Pop-up connect window for payment apps (sandbox). When done, it tells the main tab and closes itself.
export default function ConnectPopup({ params }: { params: { app: string } }) {
  const app = NAMES[params.app] || "App";
  const finish = (name: string) => {
    if (window.opener) {
      window.opener.postMessage({ type: "tn-connected", app: name }, window.location.origin);
      window.close();
    } else {
      window.location.href = "/";
    }
  };
  return <AppConnect app={app} standalone onClose={() => (window.opener ? window.close() : (window.location.href = "/"))} onDone={finish} />;
}

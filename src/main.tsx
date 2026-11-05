import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// ?bench を付けて開くと、フェーズ0の計測用ページになる(実機での速さの確認用)
const isBench = new URLSearchParams(location.search).has("bench");

async function start() {
  const root = createRoot(document.getElementById("root")!);
  if (isBench) {
    const { BenchApp } = await import("./bench/BenchApp");
    root.render(
      <StrictMode>
        <BenchApp />
      </StrictMode>,
    );
  } else {
    const { App } = await import("./app/App");
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
}

start();

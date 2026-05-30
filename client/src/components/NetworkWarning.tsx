import { useWalletContext } from "../providers/WalletProvider";

/**
 * Renders a full-screen blocking modal when the connected wallet's network
 * does not match VITE_STELLAR_NETWORK.
 *
 * The overlay intercepts all pointer events so no raffle action can proceed
 * until the user switches to the correct network.
 */
const NetworkWarning = () => {
  const { isConnected, networkMismatch, requiredNetwork, switchNetwork, network } =
    useWalletContext();

  if (!isConnected || !networkMismatch) return null;

  const connected = network ?? "unknown";
  const required = requiredNetwork.toUpperCase();

  return (
    <>
      {/* Backdrop — blocks all underlying interactions */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          backgroundColor: "rgba(0, 0, 0, 0.65)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Modal dialog */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="nw-title"
        aria-describedby="nw-desc"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          pointerEvents: "all",
        }}
      >
        <div
          style={{
            backgroundColor: "#11172E",
            border: "1px solid #e11d48",
            borderRadius: "1rem",
            padding: "2rem",
            maxWidth: "420px",
            width: "100%",
            textAlign: "center",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.6)",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "3rem",
              height: "3rem",
              borderRadius: "50%",
              backgroundColor: "rgba(225, 29, 72, 0.15)",
              marginBottom: "1rem",
              fontSize: "1.5rem",
            }}
          >
            ⚠️
          </div>

          <h2
            id="nw-title"
            style={{
              color: "#f9fafb",
              fontWeight: 700,
              fontSize: "1.2rem",
              marginBottom: "0.75rem",
            }}
          >
            Wrong Network
          </h2>

          <p
            id="nw-desc"
            style={{
              color: "#9CA3AF",
              fontSize: "0.9rem",
              lineHeight: 1.6,
              marginBottom: "1.5rem",
            }}
          >
            Your wallet is connected to{" "}
            <strong style={{ color: "#f87171" }}>{connected.toUpperCase()}</strong>, but this
            app requires <strong style={{ color: "#34d399" }}>{required}</strong>.
            <br />
            All raffle actions are disabled until you switch.
          </p>

          <button
            type="button"
            onClick={switchNetwork}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              backgroundColor: "#e11d48",
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.65rem 1.5rem",
              fontWeight: 600,
              fontSize: "0.9rem",
              cursor: "pointer",
              transition: "opacity 0.2s",
              width: "100%",
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Switch to {required}
          </button>

          <p style={{ color: "#6B7280", fontSize: "0.75rem", marginTop: "0.75rem" }}>
            If your wallet doesn&apos;t support automatic switching, change the
            network manually in your wallet extension and reconnect.
          </p>
        </div>
      </div>
    </>
  );
};

export default NetworkWarning;
